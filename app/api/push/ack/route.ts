import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rate_limit } from '@/lib/rate_limit'
import { ACK_EVENTS, type AckEvent } from '@/app/_utils/push_delivery'

export const dynamic = 'force-dynamic'

// POST /api/push/ack  { token, event: 'delivered' | 'opened' }
//
// The service worker's receipt for a push: called when it shows the notification
// and when the user taps it. Public, because a service worker may outlive the login
// cookie — the token minted per device per push (send_push_to_user) is the only
// credential, and all it can do is stamp a timestamp on its own row. Each stamp is
// write-once, so a replay changes nothing.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await rate_limit(`push_ack:${ip}`, 60, 60))) return new NextResponse(null, { status: 429 })

  const body = (await req.json().catch(() => null)) as { token?: unknown; event?: unknown } | null
  const token = typeof body?.token === 'string' && body.token.length <= 64 ? body.token : null
  const event = ACK_EVENTS.includes(body?.event as AckEvent) ? (body!.event as AckEvent) : null
  if (!token || !event) return new NextResponse(null, { status: 400 })

  const now = new Date()
  // Opening implies it was shown, even when the 'delivered' receipt never made it.
  await prisma.push_delivery.updateMany({ where: { token, delivered_at: null }, data: { delivered_at: now } })
  if (event === 'opened') await prisma.push_delivery.updateMany({ where: { token, opened_at: null }, data: { opened_at: now } })

  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
