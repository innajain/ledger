import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { headers } from 'next/headers'
import { metricsStorage, type MetricsContext } from './context'
import { persistMetrics } from './persist'

export const PROFILING_ENABLED = process.env.PROFILING !== 'off'

export function profile<Args extends unknown[], R>(route: string, fn: (...args: Args) => Promise<R>): (...args: Args) => Promise<R> {
  if (!PROFILING_ENABLED) return fn

  return async (...args: Args): Promise<R> => {
    const h = await headers()
    const user_id = h.get('x-user-id') ?? undefined

    const ctx: MetricsContext = {
      request_id: crypto.randomUUID(),
      route,
      user_id,
      started_at: performance.now(),
      db_query_count: 0,
      db_query_ms: 0,
      redis_hits: 0,
      redis_misses: 0,
      redis_ms: 0,
      external_count: 0,
      external_ms: 0,
      compute_ms: 0,
      slow_queries: [],
    }

    return Sentry.startSpan({ name: route, op: 'ledger.page' }, async span => {
      span.setAttribute('ledger.request_id', ctx.request_id)

      try {
        return await metricsStorage.run(ctx, () => fn(...args))
      } finally {
        const totalMs = performance.now() - ctx.started_at
        span.setAttributes({
          'ledger.db.query_count': ctx.db_query_count,
          'ledger.db.duration_ms': ctx.db_query_ms,
          'ledger.redis.hit_count': ctx.redis_hits,
          'ledger.redis.miss_count': ctx.redis_misses,
          'ledger.redis.duration_ms': ctx.redis_ms,
          'ledger.external.count': ctx.external_count,
          'ledger.external.duration_ms': ctx.external_ms,
          'ledger.compute.duration_ms': ctx.compute_ms,
          'ledger.db.slow_query_count': ctx.slow_queries.length,
        })
        persistMetrics(ctx, totalMs)
      }
    })
  }
}

export async function recordCompute<T>(fn: () => Promise<T> | T): Promise<T> {
  const ctx = metricsStorage.getStore()
  if (!ctx) return fn()
  const start = performance.now()
  try {
    return await fn()
  } finally {
    ctx.compute_ms += performance.now() - start
  }
}

export async function recordExternal<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = metricsStorage.getStore()
  if (!ctx) return fn()
  const start = performance.now()
  try {
    return await fn()
  } finally {
    ctx.external_count += 1
    ctx.external_ms += performance.now() - start
  }
}
