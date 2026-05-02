import { NextResponse } from 'next/server'
import { sync_nav } from '@/app/_utils/price_fetcher'
import { env, isProd } from '@/lib/env'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  // Validate request to ensure it's Vercel calling
  const authHeader = request.headers.get('authorization')

  if (isProd() && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    logger.error({ route: '/api/cron/sync-nav', secretConfigured: !!env.CRON_SECRET }, 'Cron auth failed')
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const count = await sync_nav()
    return NextResponse.json({ success: true, count, message: `Synced ${count} NAVs successfully` })
  } catch (error) {
    logger.error({ err: error, route: '/api/cron/sync-nav' }, 'CRON sync-nav failed')
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
