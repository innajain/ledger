import 'server-only'
import { redis } from '@/lib/redis'
import { auditRef, logger } from '@/lib/logger'

export async function rate_limit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const k = `rl:${key}`
    // One round trip instead of incr-then-expire: SET NX seeds the counter with its TTL
    // only when the window doesn't exist yet, so the expiry is never extended.
    const results = await redis.pipeline().set(k, '0', 'EX', windowSeconds, 'NX').incr(k).exec()
    const count = Number(results?.[1]?.[1] ?? 0)
    return count <= limit
  } catch (err) {
    // Keep the limiter prefix (`login:ip`, `login:user`, `signup:ip`) in the
    // clear so the log says which limiter degraded; only the identifier after
    // the last colon is hashed.
    const cut = key.lastIndexOf(':')
    const limiter = cut === -1 ? key : key.slice(0, cut)
    const subject_ref = cut === -1 ? undefined : auditRef(key.slice(cut + 1))
    logger.warn({ err, limiter, subject_ref, event: 'operation.degraded', action: 'rate_limit.check', fail_open: true }, 'rate limit check failed')
    return true
  }
}
