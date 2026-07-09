import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

export type SlowQueryEntry = {
  model?: string
  action?: string
  duration_ms: number
}

export type MetricsContext = {
  request_id: string
  route: string
  user_id?: string
  started_at: number
  db_query_count: number
  db_query_ms: number
  redis_hits: number
  redis_misses: number
  redis_ms: number
  external_count: number
  external_ms: number
  compute_ms: number
  slow_queries: SlowQueryEntry[]
}

declare global {
  var __metricsStorage: AsyncLocalStorage<MetricsContext> | undefined
}

export const metricsStorage: AsyncLocalStorage<MetricsContext> = globalThis.__metricsStorage ?? new AsyncLocalStorage<MetricsContext>()
if (!globalThis.__metricsStorage) globalThis.__metricsStorage = metricsStorage

export function currentMetrics(): MetricsContext | undefined {
  return metricsStorage.getStore()
}

export const SLOW_QUERY_THRESHOLD_MS = 100
