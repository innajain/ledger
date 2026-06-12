import 'server-only'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

// Fixed-window rate limiter backed by Redis. Returns true if the action is
// allowed, false once the caller has exceeded `limit` within `windowSeconds`.
//
// Fails open (allows) when Redis is unavailable: a cache outage should degrade
// throttling, not lock everyone out of logging in. The trade-off is that an
// attacker who can take Redis down also removes the limit — acceptable here.
export async function rate_limit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const k = `rl:${key}`
    const count = await redis.incr(k)
    if (count === 1) await redis.expire(k, windowSeconds)
    return count <= limit
  } catch (err) {
    logger.warn({ err, key }, 'rate_limit check failed; allowing request')
    return true
  }
}
