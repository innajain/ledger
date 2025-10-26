"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_purpose_bucket } from '@/server actions/purpose_bucket/delete';

type AllocationSource = {
  id: string;
  asset?: { id: string; name: string };
  account?: { id: string; name: string };
};

type Allocation = {
  id: string;
  quantity: number;
  allocation_thru_income?: AllocationSource | null;
  allocation_thru_account_opening?: AllocationSource | null;
};

type Expense = { id: string; quantity: number; date: string | Date; account?: { id: string; name: string }; asset?: { id: string; name: string } };

type BucketView = {
  id: string;
  name: string;
  allocation_to_purpose_bucket: Allocation[];
  expense_txn: Expense[];
};

export default function ClientPage({ initial_data }: { initial_data: BucketView }) {
  const bucket = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm('Delete this purpose bucket? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await delete_purpose_bucket({ id: bucket.id });
      router.push('/purpose_buckets');
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-yellow-50 to-amber-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{bucket.name}</h1>
            <div className="text-sm text-gray-600">Bucket ID: {bucket.id}</div>
          </div>
          <div className="text-right">
            <div className="flex gap-2 items-center">
              <Link href={`/purpose_buckets/${bucket.id}/edit`} className="px-3 py-1 border rounded text-sm">Edit</Link>
              <button onClick={onDelete} disabled={deleting} className="px-3 py-1 bg-red-500 text-white rounded text-sm">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
            <div className="mt-2">
              <Link href="/purpose_buckets" className="text-sm text-blue-600 hover:underline">Back</Link>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Allocations</h2>
          <div className="space-y-2">
            {bucket.allocation_to_purpose_bucket.map((a: any) => (
              <div key={a.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">Allocation</div>
                    <div className="text-sm text-gray-500">{a.quantity}</div>
                  </div>
                  <div className="text-sm text-gray-500">From: {a.allocation_thru_income ? 'Income' : 'Opening'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Expenses</h2>
          <div className="space-y-2">
            {bucket.expense_txn.map((e: any) => (
              <div key={e.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{e.account?.name}</div>
                    <div className="text-sm text-gray-500">{String(e.date)}</div>
                  </div>
                  <div className="text-right">{e.quantity}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
