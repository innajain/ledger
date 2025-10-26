"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { create_asset } from '@/server actions/asset/create';

type AssetType = 'rupees' | 'mf' | 'etf' | 'other';

export default function ClientPage() {
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('rupees');
  const [code, setCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await create_asset({ name, type, code: code || null });
      // navigate to created asset view if id present
      const id = res?.id;
      if (id) {
        router.push(`/assets/${id}`);
        return;
      }
      setSuccess('Asset created');
      setName('');
      setCode('');
      setType('rupees');
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50 to-cyan-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Create Asset</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select value={type} onChange={e => setType(e.target.value as AssetType)} className="mt-1 block w-full border rounded px-3 py-2">
              <option value="rupees">Rupees</option>
              <option value="mf">Mutual Fund</option>
              <option value="etf">ETF</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Code (for MF/ETF)</label>
            <input value={code} onChange={e => setCode(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          {error && <div className="text-red-600">{error}</div>}
          {success && <div className="text-green-600">{success}</div>}

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-teal-500 text-white rounded">Create</button>
            <a href="/assets" className="px-4 py-2 border rounded">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
