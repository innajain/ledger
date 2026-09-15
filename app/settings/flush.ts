'use server'

import { redis } from '@/lib/redis'
import { require_admin } from '@/app/_actions/auth'
import { ActionResult, ok } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import { audit, logger } from '@/lib/logger'

export async function flush_redis(): Promise<ActionResult> {
  try {
    const admin_id = await require_admin()
    await redis
      .connect()
      .catch(error => logger.debug({ err: error, event: 'operation.degraded', action: 'admin.redis_connect' }, 'Redis was already connected'))
    await redis.flushall()
    audit('admin.flush_redis', admin_id)
    return ok(undefined, 'Redis cache flushed successfully')
  } catch (err: unknown) {
    return reportActionError(err, { action: 'admin.flush_redis' })
  }
}
