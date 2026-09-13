import Redis from "ioredis";

// In-memory fallback cache
interface CacheEntry<T> {
  value: T;
  expiry: number;
}

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
      console.log("[Redis] Connected successfully to", redisUrl);
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

  // Memory cache lookup
  const entry = memoryCache.get(key);
  if (entry) {
    if (Date.now() > entry.expiry) {
      memoryCache.delete(key);
      return null;
    }
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
