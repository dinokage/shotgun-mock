import Redis from "ioredis";

// A cache outage must never take the app down with it -- every helper below
// swallows Redis errors and falls back to "miss"/"no-op", so a route that
// calls cacheGet() then falls back to its normal DB query on a null keeps
// working exactly as it did before Redis existed, just slower. lazyConnect
// plus this error handler stops ioredis's default behavior of logging (and,
// under some configs, throwing) a fresh stack trace for every dropped
// connection while the redis container is still starting up.
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});
redis.on("error", (err) => {
  console.error("[cache] redis error:", err.message);
});

let connecting: Promise<void> | null = null;
async function ensureConnected() {
  if (redis.status === "ready") return;
  if (!connecting) {
    connecting = redis.connect().catch(() => {
      // Swallowed here; every call site treats a still-down connection as a
      // cache miss via the try/catch around the actual GET/SET below.
    });
  }
  await connecting;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    await ensureConnected();
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.error(`[cache] get(${key}) failed:`, (err as Error).message);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    await ensureConnected();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error(`[cache] set(${key}) failed:`, (err as Error).message);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await ensureConnected();
    await redis.del(...keys);
  } catch (err) {
    console.error(`[cache] del(${keys.join(",")}) failed:`, (err as Error).message);
  }
}

// Key builders live here (not scattered across route files) so a cache key
// used to read is guaranteed to match the one used to invalidate.
export const cacheKeys = {
  userMe: (tenantId: string, userId: string) => `me:${tenantId}:${userId}`,
  tasksList: (tenantId: string) => `tasks:${tenantId}`,
};
