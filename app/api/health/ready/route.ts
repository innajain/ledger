import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { rate_limit } from '@/lib/rate_limit'

export const dynamic = 'force-dynamic'

// Readiness: are the dependencies reachable? Never cached — a cached readiness
// probe reports health it did not observe, which is worse than no probe. It is
// rate limited per IP instead, so an unauthenticated caller cannot use it to
// drive Postgres connections and Redis round trips on demand.
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rate_limit(`health:ip:${ip}`, 10, 60)))
    return NextResponse.json({ status: 'rate_limited' }, { status: 429, headers: { 'Cache-Control': 'no-store' } })

  const startedAt = performance.now()
  const [database, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()])
  const healthy = database.status === 'fulfilled' && cache.status === 'fulfilled'

  // Status per dependency, never the underlying error: a raw driver message
  // carries hosts, ports and credentials.
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'ledger',
      checks: {
        database: database.status === 'fulfilled' ? 'ok' : 'unreachable',
        cache: cache.status === 'fulfilled' ? 'ok' : 'unreachable',
      },
      checked_at: new Date().toISOString(),
      latency_ms: Math.round(performance.now() - startedAt),
    },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
