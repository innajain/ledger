import { NextResponse } from 'next/server'
import { sync_nav } from '@/app/_utils/price_fetcher'
import { check_cron_auth } from '@/lib/cron'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const denied = check_cron_auth(request, '/api/cron/sync-nav')
  if (denied) return denied

  try {
    const count = await sync_nav()
    return NextResponse.json({ success: true, count, message: `Synced ${count} NAVs successfully` })
  } catch (error) {
    logger.error({ err: error, route: '/api/cron/sync-nav' }, 'CRON sync-nav failed')
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
