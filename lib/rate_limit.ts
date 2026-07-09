import 'server-only'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

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
