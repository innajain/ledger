'use server'

import { redis } from '@/lib/redis'
import { require_admin } from './auth'

export async function flush_redis() {
  await require_admin()
  try {
    // Ensure connection (ioredis with lazyConnect will connect automatically on command)
    await redis.connect().catch(() => {})
    // Flush all keys from the current Redis instance
    await redis.flushall()
    return { ok: true }
  } catch (err: unknown) {
    throw new Error(err instanceof Error ? err.message : String(err))
  }
}
