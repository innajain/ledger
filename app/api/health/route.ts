import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = performance.now()
  const [database, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()])
  const healthy = database.status === 'fulfilled' && cache.status === 'fulfilled'

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'ledger',
      checked_at: new Date().toISOString(),
      latency_ms: Math.round(performance.now() - startedAt),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
