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

export async function POST(req: Request) {
  if (!PROFILING_ENABLED) return NextResponse.json({ ok: true })
  try {
    const body = await req.json()
    const parsed = VitalSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
    }
    const { route, name, value, rating, navigationType } = parsed.data

    await prisma.web_vital.create({
      data: {
        route,
        name,
        value,
        rating: rating ?? null,
        navigation_type: navigationType ?? null,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.warn({ err }, 'failed to record web_vital')
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
