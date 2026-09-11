import { redis } from "@/server/redis";

/**
 * Fixed-window Redis-backed rate limiter (directive §131/§187).
 * Returns true if the request is allowed, false if the limit was exceeded.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const redisKey = `ratelimit:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}
