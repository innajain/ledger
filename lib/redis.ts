import Redis from 'ioredis'
import { env } from './env'
import { logger } from './logger'

// Create a Redis client instance
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: times => {
    if (times > 3) {
      return null // Stop retrying
    }
    return Math.min(times * 50, 2000) // Wait 50ms, 100ms, 150ms
  },
  lazyConnect: true, // Don't connect immediately
})

redis.on('error', err => {
  logger.error({ err }, 'Redis client error')
})

redis.on('connect', () => {
  logger.info('Redis connected')
})
