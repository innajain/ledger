import 'server-only'
import { env, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

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
