import { getCachedData, setCachedData } from "./redis";

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const memoryRateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Sliding window rate limiter supporting distributed Redis with in-memory fallback.
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = { maxRequests: 30, windowSeconds: 60 }
): Promise<{ allowed: boolean; remaining: number; resetInSeconds: number }> {
  const now = Date.now();
  const cacheKey = `ratelimit:${identifier}`;

  // Try Redis-backed rate limit check
  try {
    const current = await getCachedData<{ count: number; resetAt: number }>(cacheKey);
    if (current && now < current.resetAt) {
      if (current.count >= config.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetInSeconds: Math.ceil((current.resetAt - now) / 1000),
        };
      }
      const updated = { count: current.count + 1, resetAt: current.resetAt };
      const ttl = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      await setCachedData(cacheKey, updated, ttl);
      return {
        allowed: true,
        remaining: config.maxRequests - updated.count,
        resetInSeconds: ttl,
      };
    } else {
      const resetAt = now + config.windowSeconds * 1000;
      await setCachedData(cacheKey, { count: 1, resetAt }, config.windowSeconds);
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetInSeconds: config.windowSeconds,
      };
    }
  } catch {
    // Fall through to memory
  }

  // Memory fallback rate limiter
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
