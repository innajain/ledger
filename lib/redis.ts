import Redis from 'ioredis'
import { env } from './env'
import { logger } from './logger'
import { currentMetrics } from './metrics/context'

// Create a Redis client instance
const baseRedis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: times => {
    if (times > 3) {
      return null // Stop retrying
    }
    return Math.min(times * 50, 2000) // Wait 50ms, 100ms, 150ms
  },
  lazyConnect: true, // Don't connect immediately
})

baseRedis.on('error', err => {
  logger.error({ err }, 'Redis client error')
})

baseRedis.on('connect', () => {
  logger.info('Redis connected')
})

// Wrap key read methods to record hit/miss + timing into the request context.
// We only instrument the methods we actually use elsewhere in the codebase.
function instrument<Fn extends (...args: never[]) => Promise<unknown>>(name: 'get' | 'setex' | 'del' | 'pipeline_exec', fn: Fn): Fn {
  return (async (...args: Parameters<Fn>) => {
    const ctx = currentMetrics()
    const start = ctx ? performance.now() : 0
    try {
      const result = await fn(...args)
      if (ctx) {
        ctx.redis_ms += performance.now() - start
        if (name === 'get') {
          if (result === null) ctx.redis_misses += 1
          else ctx.redis_hits += 1
        }
      }
      return result
    } catch (err) {
      if (ctx) ctx.redis_ms += performance.now() - start
      throw err
    }
  }) as Fn
}

const origGet = baseRedis.get.bind(baseRedis)
const origSetex = baseRedis.setex.bind(baseRedis)
const origDel = baseRedis.del.bind(baseRedis)
baseRedis.get = instrument('get', origGet) as typeof baseRedis.get
baseRedis.setex = instrument('setex', origSetex) as typeof baseRedis.setex
baseRedis.del = instrument('del', origDel) as typeof baseRedis.del

export const redis = baseRedis
