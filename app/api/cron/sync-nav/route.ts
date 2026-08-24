import { NextResponse } from 'next/server'
import { sync_nav, sync_etf_quotes } from '@/app/_utils/price_fetcher'
import { check_cron_auth } from '@/lib/cron'
import { logger } from '@/lib/logger'

export async function GET(request: Request) {
  const denied = check_cron_auth(request, '/api/cron/sync-nav')
  if (denied) return denied

  // The two refreshes are independent — an AMFI feed failure shouldn't stop the ETF
  // pre-warm (or vice versa), so failures are collected rather than thrown.
  const [nav, etf] = await Promise.allSettled([sync_nav(), sync_etf_quotes()])

  const navOk = nav.status === 'fulfilled'
  if (!navOk) logger.error({ err: nav.reason, route: '/api/cron/sync-nav' }, 'CRON sync-nav failed')
  const etfStats = etf.status === 'fulfilled' ? etf.value : null
  if (etf.status === 'rejected') logger.error({ err: etf.reason, route: '/api/cron/sync-nav' }, 'CRON sync_etf_quotes failed')

  const body = {
    success: navOk && etf.status === 'fulfilled',
    nav_count: navOk ? nav.value : null,
    etf: etfStats,
    ...(navOk ? {} : { error: String(nav.reason) }),
  }
  return NextResponse.json(body, { status: body.success ? 200 : 500 })
}
