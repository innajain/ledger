import Redis from 'ioredis'
import { env } from './env'

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
  console.error('Redis Client Error:', err)
})

redis.on('connect', () => {
  console.log('Redis Connected')
})
