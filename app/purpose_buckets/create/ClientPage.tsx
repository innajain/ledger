"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { create_purpose_bucket } from '@/server actions/purpose_bucket/create';

export default function ClientPage() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await create_purpose_bucket({ name });
      const id = res?.id;
      if (id) {
        router.push(`/purpose_buckets/${id}`);
        return;
      }
      setSuccess('Purpose bucket created');
      setName('');
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-yellow-50 to-amber-50 p-6">
      <div className="max-w-md mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Create Purpose Bucket</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          {error && <div className="text-red-600">{error}</div>}
          {success && <div className="text-green-600">{success}</div>}

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-amber-500 text-white rounded">Create</button>
            <a href="/purpose_buckets" className="px-4 py-2 border rounded">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
