import Redis from "ioredis";
import crypto from "crypto";

// In-memory fallback cache
interface CacheEntry<T> {
  value: T;
  expiry: number;
}

const MAX_MEMORY_CACHE_ENTRIES = 5000;
const memoryCache = new Map<string, CacheEntry<unknown>>();

let redisClient: Redis | null = null;
let isRedisAvailable = false;
let connectionAttempted = false;

function initRedis() {
  if (connectionAttempted) return;
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy(times) {
        if (times > 2) {
          return null; // Stop retrying and fallback to memory
        }
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true,
    });

    redisClient.on("connect", () => {
      isRedisAvailable = true;
      const sanitized = redisUrl.replace(/:([^@]+)@/, ":****@");
      console.log("[Redis] Connected successfully to", sanitized);
    });

    redisClient.on("error", () => {
      isRedisAvailable = false;
      // Silent error in dev/fallback mode
      if (process.env.NODE_ENV === "development") {
        // console.warn("[Redis] Not available, falling back to memory cache");
      }
    });

    redisClient.connect().catch(() => {
      isRedisAvailable = false;
    });
  } catch (err) {
    isRedisAvailable = false;
  }
}

export function getRedisClient(): Redis | null {
  initRedis();
  return isRedisAvailable && redisClient ? redisClient : null;
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  initRedis();

  if (isRedisAvailable && redisClient) {
    try {
      const data = await redisClient.get(key);
      if (data) {
        return JSON.parse(data) as T;
      }
    } catch {
      // Fallback to memory
    }
  }

  // Memory cache lookup with LRU renewal
  const entry = memoryCache.get(key);
  if (entry) {
    if (Date.now() > entry.expiry) {
      memoryCache.delete(key);
      return null;
    }
    // Refresh LRU order (move to most recently used)
    memoryCache.delete(key);
    memoryCache.set(key, entry);
    return entry.value as T;
  }

  return null;
}

export async function setCachedData<T>(
  key: string,
  value: T,
  ttlSeconds = 300
): Promise<void> {
  initRedis();

  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {
      // Fallback to memory
    }
  }

  // LRU eviction if size limit reached
  if (memoryCache.has(key)) {
    memoryCache.delete(key);
  } else if (memoryCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey) {
      memoryCache.delete(oldestKey);
    }
  }

  // Always store in memory cache as well
  memoryCache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function deleteCachedData(key: string): Promise<void> {
  initRedis();
  memoryCache.delete(key);
  if (isRedisAvailable && redisClient) {
    try {
      await redisClient.del(key);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Distributed Locking (Redlock pattern with process-level fallback)
// ---------------------------------------------------------------------------

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
`;

// In-process lock map for serialized fallback or local single-node development
const inProcessLockMap = new Map<string, Promise<unknown>>();

async function withProcessLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = inProcessLockMap.get(key) || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  inProcessLockMap.set(key, next);

  await current.catch(() => {});
  try {
    return await fn();
  } finally {
    release!();
    if (inProcessLockMap.get(key) === next) {
      inProcessLockMap.delete(key);
    }
  }
}

export interface DistributedLockOptions {
  ttlMs?: number;
  maxWaitMs?: number;
  retryIntervalMs?: number;
}

/**
 * Executes an operation under a distributed lock using Redis (Redlock pattern).
 * Acquires lock atomically via `SET resourceKey lockValue PX ttl NX`.
 * Automatically releases using an atomic Lua script to guarantee only the owner releases the lock.
 * If Redis is offline or disconnected, seamlessly falls back to a serialized in-process mutex.
 */
export async function withDistributedLock<T>(
  resourceKey: string,
  fn: () => Promise<T>,
  options: DistributedLockOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs || 10000; // 10s default TTL
  const maxWaitMs = options.maxWaitMs || 8000; // 8s max wait
  const retryIntervalMs = options.retryIntervalMs || 50;

  const redis = getRedisClient();

  if (!redis) {
    return withProcessLock(resourceKey, fn);
  }

  const lockKey = `lock:${resourceKey}`;
  const lockValue = crypto.randomUUID();
  const startTime = Date.now();

  let acquired = false;
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await redis.set(lockKey, lockValue, "PX", ttlMs, "NX");
      if (res === "OK") {
        acquired = true;
        break;
      }
    } catch {
      // Fallback on Redis transient communication error
      return withProcessLock(resourceKey, fn);
    }

    // Jittered backoff to avoid lock convoys
    const jitter = Math.floor(Math.random() * 20) - 10;
    await new Promise((resolve) => setTimeout(resolve, Math.max(10, retryIntervalMs + jitter)));
  }

  if (!acquired) {
    // If waiting on Redis timed out, execute under safety in-process mutex
    return withProcessLock(resourceKey, fn);
  }

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_LOCK_LUA, 1, lockKey, lockValue);
    } catch {
      // Lock will expire automatically if evaluation fails
    }
  }
}

// ---------------------------------------------------------------------------
// Server-Side Token Blacklist / Revocation
// ---------------------------------------------------------------------------

const memoryTokenBlacklist = new Map<string, number>();

/**
 * Revokes a JWT token server-side on logout or account deletion.
 */
export async function blacklistToken(token: string, ttlSeconds = 86400): Promise<void> {
  if (!token) return;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const key = `blacklist:${tokenHash}`;

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(key, "revoked", "EX", ttlSeconds);
    } catch {}
  }

  // Also maintain in-memory blacklist with expiration
  memoryTokenBlacklist.set(tokenHash, Date.now() + ttlSeconds * 1000);

  // Periodically clean up expired entries
  if (memoryTokenBlacklist.size > 2000) {
    const now = Date.now();
    for (const [hash, expiry] of memoryTokenBlacklist.entries()) {
      if (now > expiry) memoryTokenBlacklist.delete(hash);
    }
  }
}

/**
 * Checks if a JWT token has been revoked server-side.
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  if (!token) return true;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const memExpiry = memoryTokenBlacklist.get(tokenHash);
  if (memExpiry) {
    if (Date.now() < memExpiry) {
      return true;
    }
    memoryTokenBlacklist.delete(tokenHash);
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const val = await redis.get(`blacklist:${tokenHash}`);
      return val === "revoked";
    } catch {}
  }

  return false;
}
