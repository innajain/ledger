import { NextResponse } from 'next/server'
import { sync_nav } from '@/app/_utils/price_fetcher'
import { env, isProd } from '@/lib/env'

export async function GET(request: Request) {
  // Validate request to ensure it's Vercel calling
  const authHeader = request.headers.get('authorization')

  if (isProd() && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    console.error(`Cron Auth Failed: authHeader=${authHeader}, EXPECTED=Bearer ${env.CRON_SECRET ? '***' : 'UNDEFINED'}`)
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const count = await sync_nav()
    return NextResponse.json({ success: true, count, message: `Synced ${count} NAVs successfully` })
  } catch (error) {
    console.error('CRON sync-nav failed:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
