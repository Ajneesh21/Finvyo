import { getRedisClient } from "./redis";

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const memoryRateLimitMap = new Map<string, { count: number; resetAt: number }>();

const LUA_RATE_LIMIT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
if ttl == -1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

/**
 * Sliding window rate limiter supporting atomic distributed Redis with isolated in-memory fallback.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 30, windowSeconds: 60 }
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const now = Date.now();
  const cacheKey = `ratelimit:${identifier}`;

  // Try Redis-backed atomic rate limit check
  try {
    const redis = getRedisClient();
    if (redis) {
      const res = (await redis.eval(
        LUA_RATE_LIMIT,
        1,
        cacheKey,
        config.windowSeconds
      )) as [number, number];

      const count = Number(res[0]);
      const ttl = Number(res[1]) > 0 ? Number(res[1]) : config.windowSeconds;

      if (count > config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetInSeconds: ttl,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, config.maxRequests - count),
        resetInSeconds: ttl,
      };
    }
  } catch {
    // Fall through to in-memory limiter on Redis error or disconnect
  }

  // Isolated memory fallback rate limiter (never touches LRU cache)
  const memEntry = memoryRateLimitMap.get(identifier);
  if (memEntry && now < memEntry.resetAt) {
    if (memEntry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: Math.ceil((memEntry.resetAt - now) / 1000),
      };
    }
    memEntry.count += 1;
    return {
      allowed: true,
      remaining: config.maxRequests - memEntry.count,
      resetInSeconds: Math.ceil((memEntry.resetAt - now) / 1000),
    };
  }

  // Clean memory map if too large
  if (memoryRateLimitMap.size > 2000) {
    const expiredKeys: string[] = [];
    memoryRateLimitMap.forEach((val, k) => {
      if (now > val.resetAt) expiredKeys.push(k);
    });
    expiredKeys.forEach((k) => memoryRateLimitMap.delete(k));
  }

  const resetAt = now + config.windowSeconds * 1000;
  memoryRateLimitMap.set(identifier, { count: 1, resetAt });

  return {
    allowed: true,
    remaining: config.maxRequests - 1,
    resetInSeconds: config.windowSeconds,
  };
}
