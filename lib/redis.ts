import 'server-only'
import Redis from 'ioredis'
import { env } from './env'
import { logger } from './logger'
import { currentMetrics } from './metrics/context'
import { publishQueryEvent } from './dev/query-bus'

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
function instrument<Fn extends (...args: never[]) => Promise<unknown>>(
  name: 'get' | 'mget' | 'set' | 'setex' | 'del' | 'incr' | 'pipeline_exec',
  fn: Fn,
): Fn {
  return (async (...args: Parameters<Fn>) => {
    const ctx = currentMetrics()
    const start = performance.now()
    let errored = false
    let hit: boolean | undefined
    try {
      const result = await fn(...args)
      if (name === 'get') hit = result !== null
      if (ctx) {
        ctx.redis_ms += performance.now() - start
        if (name === 'get') {
          if (result === null) ctx.redis_misses += 1
          else ctx.redis_hits += 1
        } else if (name === 'mget' && Array.isArray(result)) {
          for (const v of result) {
            if (v === null) ctx.redis_misses += 1
            else ctx.redis_hits += 1
          }
        }
      }
      return result
    } catch (err) {
      errored = true
      if (ctx) ctx.redis_ms += performance.now() - start
      throw err
    } finally {
      publishQueryEvent({
        kind: 'redis',
        op: name,
        duration_ms: performance.now() - start,
        hit,
        error: errored || undefined,
      })
    }
  }) as Fn
}

const origGet = baseRedis.get.bind(baseRedis)
const origMget = baseRedis.mget.bind(baseRedis)
const origSet = baseRedis.set.bind(baseRedis)
const origSetex = baseRedis.setex.bind(baseRedis)
const origDel = baseRedis.del.bind(baseRedis)
const origIncr = baseRedis.incr.bind(baseRedis)
baseRedis.get = instrument('get', origGet) as typeof baseRedis.get
baseRedis.mget = instrument('mget', origMget) as typeof baseRedis.mget
baseRedis.set = instrument('set', origSet) as typeof baseRedis.set
baseRedis.setex = instrument('setex', origSetex) as typeof baseRedis.setex
baseRedis.del = instrument('del', origDel) as typeof baseRedis.del
baseRedis.incr = instrument('incr', origIncr) as typeof baseRedis.incr

export const redis = baseRedis
