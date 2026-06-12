import 'server-only'
import { env, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

// Authorize a cron invocation. Returns an error Response to short-circuit with,
// or null when the request is allowed to proceed.
//
// Fails closed: in production a missing CRON_SECRET rejects every request,
// instead of comparing the header against the literal string "Bearer undefined"
// (which the old per-route check would have accepted). Cron is unauthenticated
// in dev so local invocations stay easy.
export function check_cron_auth(request: Request, route: string): Response | null {
  if (!isProd()) return null
  if (!env.CRON_SECRET) {
    logger.error({ route }, 'CRON_SECRET is not configured — refusing cron request')
    return new Response('Unauthorized', { status: 401 })
  }
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    logger.error({ route }, 'Cron auth failed')
    return new Response('Unauthorized', { status: 401 })
  }
  return null
}
