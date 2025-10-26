import Redis from 'ioredis';

// Create a Redis client instance
const redis = new Redis(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Stop retrying
      }
      return Math.min(times * 50, 2000); // Wait 50ms, 100ms, 150ms
    },
    lazyConnect: true, // Don't connect immediately
  }
);

redis.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('Redis Client Connected');
});

export default redis;
