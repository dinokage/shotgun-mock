import { Request, Response, NextFunction } from "express";
import Redis from "ioredis";

// Redis-backed fixed-window limiter. Backed by the Redis already in the
// stack rather than an in-process counter, because per-process counters
// reset on every deploy and don't hold across more than one API container.
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});
redis.on("error", (err) => {
  console.error("[ratelimit] redis error:", err.message);
});

let connecting: Promise<void> | null = null;
async function ensureConnected() {
  if (redis.status === "ready") return;
  if (!connecting) connecting = redis.connect().catch(() => {});
  await connecting;
}

export interface RateLimitRule {
  /** Bucket name, e.g. "login:ip". */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
}

interface Hit {
  count: number;
  ttl: number;
}

/**
 * Increments a bucket and returns its state.
 *
 * Fails OPEN: if Redis is unreachable this returns null and the caller lets
 * the request through. A limiter that failed closed would turn a cache
 * outage into a studio-wide lockout, which is a worse outcome than briefly
 * losing brute-force protection on an internal-only Redis.
 */
async function hit(key: string, windowSeconds: number): Promise<Hit | null> {
  try {
    await ensureConnected();
    const results = await redis
      .multi()
      .incr(key)
      .ttl(key)
      .exec();
    if (!results) return null;
    const count = Number(results[0]?.[1] ?? 0);
    let ttl = Number(results[1]?.[1] ?? -1);
    // A fresh key has no expiry until we set one; -1 also covers a key that
    // somehow lost its TTL, which would otherwise block that bucket forever.
    if (ttl < 0) {
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }
    return { count, ttl };
  } catch (err) {
    console.error(`[ratelimit] hit(${key}) failed:`, (err as Error).message);
    return null;
  }
}

/** Clears a bucket — used to forgive a successful login. */
export async function resetRateLimit(rule: RateLimitRule, subject: string) {
  try {
    await ensureConnected();
    await redis.del(`rl:${rule.name}:${subject}`);
  } catch {
    // Best-effort: a stale bucket only costs the user their remaining
    // allowance in the current window.
  }
}

/**
 * The caller's IP.
 *
 * `app.set("trust proxy", 1)` makes Express read this from the single
 * X-Forwarded-For hop nginx adds. Anything reaching the API directly (port
 * 3001 is published) can still spoof that header, which is exactly why
 * login is limited per ACCOUNT as well as per IP — the account bucket
 * doesn't care what address the attempt claims to come from.
 */
export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<{ allowed: boolean; retryAfter: number; remaining: number }> {
  const state = await hit(`rl:${rule.name}:${subject}`, rule.windowSeconds);
  if (!state) return { allowed: true, retryAfter: 0, remaining: rule.limit };
  return {
    allowed: state.count <= rule.limit,
    retryAfter: state.ttl,
    remaining: Math.max(0, rule.limit - state.count),
  };
}

/**
 * Reads a bucket WITHOUT incrementing it.
 *
 * Login uses this so that only *failed* attempts spend the budget. A studio
 * sits behind one office IP, so counting successful sign-ins would mean the
 * 9am rush locks the team out of its own tool — an availability bug dressed
 * up as a security control. Failures are what an attack is made of.
 */
export async function peekRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    await ensureConnected();
    const key = `rl:${rule.name}:${subject}`;
    const [countRaw, ttlRaw] = await Promise.all([redis.get(key), redis.ttl(key)]);
    const count = Number(countRaw ?? 0);
    return {
      allowed: count < rule.limit,
      retryAfter: Math.max(1, Number(ttlRaw ?? rule.windowSeconds)),
    };
  } catch (err) {
    console.error(`[ratelimit] peek(${rule.name}) failed:`, (err as Error).message);
    return { allowed: true, retryAfter: 0 };
  }
}

/** Spends one unit of a bucket's budget. */
export async function consumeRateLimit(rule: RateLimitRule, subject: string) {
  await hit(`rl:${rule.name}:${subject}`, rule.windowSeconds);
}

function reject(res: Response, retryAfter: number) {
  res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
  res.status(429).json({
    error: "Too many attempts. Please wait and try again.",
  });
}

/** Middleware limiting by caller IP. */
export function rateLimitByIp(rule: RateLimitRule) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const { allowed, retryAfter, remaining } = await checkRateLimit(
      rule,
      clientIp(req),
    );
    res.setHeader("X-RateLimit-Limit", String(rule.limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    if (!allowed) {
      req.log?.warn(
        { ip: clientIp(req), rule: rule.name },
        "rate limit exceeded",
      );
      return reject(res, retryAfter);
    }
    next();
  };
}

export { reject as rejectRateLimited };
