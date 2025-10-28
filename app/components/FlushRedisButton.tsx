'use client';

import React, { useState } from 'react';
import { flush_redis } from '@/server actions/redis/flush';

export default function FlushRedisButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFlush() {
    const ok = confirm('Empty Redis memory? This will delete all keys in Redis. Continue?');
    if (!ok) return;
    setLoading(true);
    setMessage(null);
    try {
      await flush_redis();
      setMessage('Redis flushed successfully');
    } catch (err: any) {
      setMessage(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleFlush}
        disabled={loading}
        className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
      >
        {loading ? 'Flushing...' : 'Empty Redis'}
      </button>
      {message && <div className="text-sm mt-2 text-gray-700">{message}</div>}
    </div>
  );
}
