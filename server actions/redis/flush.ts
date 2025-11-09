'use server';

import { redis } from '@/server actions/redis/redis';

export async function flush_redis() {
  try {
    // Ensure connection (ioredis with lazyConnect will connect automatically on command)
    await redis.connect().catch(() => {});
    // Flush all keys from the current Redis instance
    await redis.flushall();
    return { ok: true };
  } catch (err: any) {
    throw new Error(err?.message || String(err));
  }
}
