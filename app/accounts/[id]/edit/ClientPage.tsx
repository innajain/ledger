"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { update_account } from '@/server actions/account/update';

export default function ClientPage({ initial_data }: { initial_data: any }) {
  const [name, setName] = useState(initial_data.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // call update_account with minimal changes: name only, and empty arrays for balances
      await update_account(initial_data.id, { name, opening_balance_creates: [], opening_balance_updates: [], opening_balance_deletes: [] });
      router.push(`/accounts/${initial_data.id}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Edit Account</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded">Save</button>
            <a href={`/accounts/${initial_data.id}`} className="px-4 py-2 border rounded">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
