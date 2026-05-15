import 'server-only'
import { headers } from 'next/headers'
import { metricsStorage, type MetricsContext } from './context'
import { persistMetrics } from './persist'

const PROFILING_ENABLED = process.env.PROFILING !== 'off'

/**
 * Wrap a server-component page (or any async server function tied to a
 * request) so that its DB / Redis / external work is grouped into a single
 * `server_metric` row plus child rows.
 *
 * Usage:
 *   export default profile('/transactions', async function Page({ ... }) {
 *     // existing body
 *   })
 *
 * The wrapper:
 *  - reads `x-user-id` from headers (set by proxy.ts after JWT verify)
 *  - starts an AsyncLocalStorage context so Prisma + Redis instrumentation
 *    can attribute work to this request
 *  - on completion, fire-and-forgets a write to `server_metric`
 */
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

    try {
      return await metricsStorage.run(ctx, async () => {
        const result = await fn(...args)
        // Stash request_id in a response header so the client can correlate
        // Web Vitals with this server render. We do this via a meta tag in
        // the layout; see app/layout.tsx.
        return result
      })
    } finally {
      const totalMs = performance.now() - ctx.started_at
      persistMetrics(ctx, totalMs)
    }
  }
}

/** Record arbitrary compute spans (e.g. XIRR loop) into the current request. */
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

/** Record an external network call (Yahoo, AMFI, etc.) into the current request. */
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
