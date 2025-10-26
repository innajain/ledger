"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_account } from '@/server actions/account/delete';

type Alloc = { id: string; quantity: number; bucket: { id: string; name: string } };
type OpeningBalance = { id: string; quantity: number; date: string | Date; asset: { id: string; name: string }; allocation_to_purpose_buckets: Alloc[] };

type AccountView = {
  id: string;
  name: string;
  opening_balances: OpeningBalance[];
};

export default function ClientPage({ initial_data }: { initial_data: AccountView }) {
  const acc = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm('Delete this account? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await delete_account(acc.id);
      router.push('/accounts');
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{acc.name}</h1>
            <div className="text-sm text-gray-600">Account ID: {acc.id}</div>
          </div>
          <div className="text-right">
            <div className="flex gap-2 items-center">
              <Link href={`/accounts/${acc.id}/edit`} className="px-3 py-1 border rounded text-sm">Edit</Link>
              <button onClick={onDelete} disabled={deleting} className="px-3 py-1 bg-red-500 text-white rounded text-sm">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
            <div className="mt-2">
              <Link href="/accounts" className="text-sm text-blue-600 hover:underline">Back</Link>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Opening Balances</h2>
          <div className="space-y-2">
            {acc.opening_balances.map((ob: OpeningBalance) => (
              <div key={ob.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{ob.asset.name}</div>
                    <div className="text-sm text-gray-500">{String(ob.date)}</div>
                  </div>
                  <div className="text-right">
                    <div>{ob.quantity}</div>
                    <div className="text-sm text-gray-500">Allocations: {ob.allocation_to_purpose_buckets.reduce((s: number, a: Alloc) => s + a.quantity, 0)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
