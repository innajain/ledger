"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  update_income_transaction,
  update_expense_transaction,
  update_self_transfer_or_refundable_or_refund_transaction,
  update_asset_trade_transaction,
} from '@/server actions/transaction/update';

function toDDMMYYYY(dateInput: string) {
  // input expected as yyyy-mm-dd
  if (!dateInput) return undefined;
  const [y, m, d] = dateInput.split('-');
  return `${d}-${m}-${y}`;
}

export default function ClientPage({ initial_data }: { initial_data: any }) {
  const txn = initial_data;
  const router = useRouter();
  const [description, setDescription] = useState(txn.description || '');
  const [dateStr, setDateStr] = useState(() => {
    // convert existing date to yyyy-mm-dd for input if present
    const d = txn.income_txn?.date || txn.expense_txn?.date || txn.self_transfer_or_refundable_or_refund_txn?.date || txn.asset_trade_txn?.debit_date;
    if (!d) return '';
    const dt = new Date(String(d));
    return dt.toISOString().slice(0, 10);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const datePayload = dateStr ? toDDMMYYYY(dateStr) : undefined;

      if (txn.income_txn) {
        await update_income_transaction(txn.id, { description, date: datePayload, allocation_to_purpose_buckets_creates: [], allocation_to_purpose_buckets_deletes: [], allocation_to_purpose_buckets_updates: [] });
      } else if (txn.expense_txn) {
        await update_expense_transaction(txn.id, { description, date: datePayload });
      } else if (txn.self_transfer_or_refundable_or_refund_txn) {
        await update_self_transfer_or_refundable_or_refund_transaction(txn.id, { description, date: datePayload });
      } else if (txn.asset_trade_txn) {
        await update_asset_trade_transaction(txn.id, { description, debit_date: datePayload, credit_date: datePayload, asset_replacement_in_purpose_buckets_creates: [], asset_replacement_in_purpose_buckets_deletes: [], asset_replacement_in_purpose_buckets_updates: [] });
      }

      router.push(`/transactions/${txn.id}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Edit Transaction</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-rose-500 text-white rounded">Save</button>
            <a href={`/transactions/${txn.id}`} className="px-4 py-2 border rounded">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
