import 'server-only'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

export async function rate_limit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const k = `rl:${key}`
    // One round trip instead of incr-then-expire: SET NX seeds the counter with its TTL
    // only when the window doesn't exist yet, so the expiry is never extended.
    const results = await redis.pipeline().set(k, '0', 'EX', windowSeconds, 'NX').incr(k).exec()
    const count = Number(results?.[1]?.[1] ?? 0)
    return count <= limit
  } catch (err) {
    logger.warn({ err, key }, 'rate_limit check failed; allowing request')
    return true
  }
}
