import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Liveness only: is this process up and serving? It deliberately touches no
// dependency, so it stays cheap enough to leave unauthenticated and uncached.
// The Postgres/Redis probe lives at /api/health/ready, which is rate limited.
export async function GET() {
  return NextResponse.json(
    { status: 'ok', service: 'ledger', checked_at: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
