import 'server-only'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { MetricsContext } from './context'

export function persistMetrics(ctx: MetricsContext, totalMs: number): void {
  logger.info(
    {
      event: 'request.completed',
      request_id: ctx.request_id,
      route: ctx.route,
      duration_ms: Math.round(totalMs),
      db_query_count: ctx.db_query_count,
      db_duration_ms: Math.round(ctx.db_query_ms),
      redis_hit_count: ctx.redis_hits,
      redis_miss_count: ctx.redis_misses,
      redis_duration_ms: Math.round(ctx.redis_ms),
      external_count: ctx.external_count,
      external_duration_ms: Math.round(ctx.external_ms),
      compute_duration_ms: Math.round(ctx.compute_ms),
      slow_query_count: ctx.slow_queries.length,
    },
    'request completed',
  )

  const write = async () => {
    try {
      await prisma.server_metric.create({
        data: {
          id: ctx.request_id,
          user_id: ctx.user_id ?? null,
          route: ctx.route,
          total_ms: Math.round(totalMs),
          db_query_count: ctx.db_query_count,
          db_query_ms: Math.round(ctx.db_query_ms),
          redis_hits: ctx.redis_hits,
          redis_misses: ctx.redis_misses,
          redis_ms: Math.round(ctx.redis_ms),
          external_count: ctx.external_count,
          external_ms: Math.round(ctx.external_ms),
          compute_ms: Math.round(ctx.compute_ms),
          slow_queries: ctx.slow_queries.length
            ? {
                createMany: {
                  data: ctx.slow_queries.map(q => ({
                    model: q.model ?? null,
                    action: q.action ?? null,
                    duration_ms: Math.round(q.duration_ms),
                  })),
                },
              }
            : undefined,
        },
      })
    } catch (err) {
      logger.warn({ err, request_id: ctx.request_id }, 'failed to persist server_metric')
    }
  }

  // after() registers the insert with the platform's waitUntil so it runs
  // post-response instead of being frozen with the instance and replayed inside
  // a later request's window (or dropped). It throws outside a request scope,
  // so fall back to plain fire-and-forget there.
  try {
    after(write)
  } catch {
    void write()
  }
}
