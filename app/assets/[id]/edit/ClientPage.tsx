"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { update_asset } from '@/server actions/asset/update';

export default function ClientPage({ initial_data }: { initial_data: any }) {
  const asset = initial_data;
  const router = useRouter();
  const [name, setName] = useState(asset.name || '');
  const [type, setType] = useState(asset.type || 'STOCK');
  const [code, setCode] = useState(asset.code || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await update_asset(initial_data.id, { name, type, code: code || null });
      router.push(`/assets/${initial_data.id}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Edit Asset</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2">
              <option value="STOCK">Stock</option>
              <option value="CRYPTO">Crypto</option>
              <option value="CASH">Cash</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Code (optional)</label>
            <input value={code} onChange={e => setCode(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-rose-500 text-white rounded">Save</button>
            <a href={`/assets/${asset.id}`} className="px-4 py-2 border rounded">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
