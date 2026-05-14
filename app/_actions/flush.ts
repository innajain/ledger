'use server'

import { redis } from '@/lib/redis'
import { require_admin } from './auth'
import { ActionResult, ok, fromError } from './_result'

export async function flush_redis(): Promise<ActionResult> {
  try {
    await require_admin()
    await redis.connect().catch(() => {})
    await redis.flushall()
    return ok(undefined, 'Redis cache flushed successfully')
  } catch (err: unknown) {
    return fromError(err)
  }
}
