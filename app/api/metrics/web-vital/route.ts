import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { PROFILING_ENABLED } from '@/lib/metrics/profile'

const VitalSchema = z.object({
  route: z.string().min(1).max(256),
  name: z.enum(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']),
  value: z.number().finite(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  navigationType: z.string().max(32).optional(),
})

// The reporter batches a page view's metrics into one beacon; a bare object is still
// accepted for any in-flight clients from before the batching change.
const PayloadSchema = z.union([z.array(VitalSchema).min(1).max(50), VitalSchema])

export async function POST(req: Request) {
  if (!PROFILING_ENABLED) return NextResponse.json({ ok: true })
  try {
    const body = await req.json()
    const parsed = PayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
    }
    const vitals = Array.isArray(parsed.data) ? parsed.data : [parsed.data]

    await prisma.web_vital.createMany({
      data: vitals.map(({ route, name, value, rating, navigationType }) => ({
        route,
        name,
        value,
        rating: rating ?? null,
        navigation_type: navigationType ?? null,
      })),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.warn({ err }, 'failed to record web_vital')
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
