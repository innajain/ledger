import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { MetricsContext } from './context'

export function persistMetrics(ctx: MetricsContext, totalMs: number): void {
  void (async () => {
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
  })()
}
