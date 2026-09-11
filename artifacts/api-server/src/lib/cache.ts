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

// Deletes every key matching a glob. Needed because the tasks list is now
// cached once per visibility scope ("all", one key per department, one per
// artist), so a single task write has to invalidate an unknown set of keys
// rather than one fixed key. SCAN (cursor-based, incremental) rather than
// KEYS, which blocks the whole Redis server while it walks the keyspace.
// A pass interrupted mid-cursor can miss a key that was rewritten during
// iteration; the scoped list keys carry a 10s TTL, which bounds that.
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    await ensureConnected();
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    console.error(`[cache] delPattern(${pattern}) failed:`, (err as Error).message);
  }
}

// Key builders live here (not scattered across route files) so a cache key
// used to read is guaranteed to match the one used to invalidate.
export const cacheKeys = {
  userMe: (tenantId: string, userId: string) => `me:${tenantId}:${userId}`,
  // scopeKey comes from visibilityScope.ts's scopeCacheKey(): without it a
  // studio-wide role's cached list would be served straight to an artist,
  // which would be a wider leak than the unscoped query it replaced.
  tasksList: (tenantId: string, scopeKey: string) => `tasks:${tenantId}:${scopeKey}`,
  tasksListAllScopes: (tenantId: string) => `tasks:${tenantId}:*`,
  // Checked on every authenticated request, so it is cached to avoid a DB
  // round-trip per call. Deliberately short-lived AND explicitly deleted
  // whenever the version is bumped, so a logout or password reset takes
  // effect immediately rather than after the TTL.
  tokenVersion: (userId: string) => `tv:${userId}`,
  // Throttles how often a request writes lastSeenAt to Postgres -- presence
  // only needs roughly-current data, not a write on every single request.
  presenceThrottle: (userId: string) => `presence:${userId}`,
};
