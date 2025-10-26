"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_asset } from '@/server actions/asset/delete';
import { formatIndianCurrency } from '@/utils/format_currency';

type Alloc = { id: string; quantity: number; bucket: { id: string; name: string } };
type OpeningBalance = { id: string; quantity: number; date: string | Date; account: { id: string; name: string }; allocation_to_purpose_buckets: Alloc[] };

type IncomeTxn = { id: string; date: string | Date; account: { id: string; name: string }; quantity: number; allocation_to_purpose_buckets: Alloc[]; description?: string | null };
type ExpenseTxn = { id: string; date: string | Date; account: { id: string; name: string }; quantity: number; purpose_bucket: { id: string; name: string }; description?: string | null };

type AssetView = {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  price?: number | null;
  opening_balances: OpeningBalance[];
  income_txn: IncomeTxn[];
  expense_txn: ExpenseTxn[];
};

export default function ClientPage({ initial_data }: { initial_data: AssetView }) {
  const asset = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await delete_asset(asset.id);
      router.push('/assets');
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{asset.name}</h1>
            <div className="text-sm text-gray-600">Type: {asset.type} {asset.code ? `• ${asset.code}` : ''}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{asset.price ? `₹${formatIndianCurrency(asset.price)}` : '—'}</div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <Link href={`/assets/${asset.id}/edit`} className="px-3 py-1 border rounded text-sm">Edit</Link>
                <button onClick={onDelete} disabled={deleting} className="px-3 py-1 bg-red-500 text-white rounded text-sm">{deleting ? 'Deleting...' : 'Delete'}</button>
              </div>
              <Link href="/assets" className="text-sm text-blue-600 hover:underline">Back</Link>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Opening Balances</h2>
          <div className="space-y-2">
            {asset.opening_balances.map((ob: OpeningBalance) => (
              <div key={ob.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{ob.account.name}</div>
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

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Income Transactions</h2>
          <div className="space-y-2">
            {asset.income_txn.map((t: IncomeTxn) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{t.account.name}</div>
                    <div className="text-sm text-gray-500">{String(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div>{t.quantity}</div>
                    <div className="text-sm text-gray-500">Allocations: {t.allocation_to_purpose_buckets.reduce((s: number, a: Alloc) => s + a.quantity, 0)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Expense Transactions</h2>
          <div className="space-y-2">
            {asset.expense_txn.map((t: ExpenseTxn) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{t.account.name}</div>
                    <div className="text-sm text-gray-500">{String(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div>{t.quantity}</div>
                    <div className="text-sm text-gray-500">From bucket: {t.purpose_bucket.name}</div>
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
