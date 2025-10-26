"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_transaction } from '@/server actions/transaction/delete';

type IncomeView = {
  asset_id: string;
  account?: { id: string; name: string };
  quantity: number;
  allocation_to_purpose_buckets?: { purpose_bucket_id: string; quantity: number; bucket?: { id: string; name: string } }[];
};

type ExpenseView = { asset_id: string; account?: { id: string; name: string }; quantity: number; purpose_bucket?: { id: string; name: string } };

type TransferView = { asset_id: string; from_account?: { id: string; name: string }; to_account?: { id: string; name: string }; quantity: number };

type AssetTradeView = {
  debit_asset_id: string;
  debit_account?: { id: string; name: string };
  debit_quantity: number;
  credit_asset_id: string;
  credit_account?: { id: string; name: string };
  credit_quantity: number;
  asset_replacement_in_purpose_buckets?: { purpose_bucket_id: string; debit_quantity: number; credit_quantity: number; purpose_bucket?: { id: string; name: string } }[];
};

type TransactionView = {
  id: string;
  type: string | null;
  description?: string | null;
  income_txn?: IncomeView | null;
  expense_txn?: ExpenseView | null;
  self_transfer_or_refundable_or_refund_txn?: TransferView | null;
  asset_trade_txn?: AssetTradeView | null;
};

export default function ClientPage({ initial_data }: { initial_data: TransactionView }) {
  const txn = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await delete_transaction(txn.id);
      router.push('/transactions');
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Transaction: {txn.id}</h1>
            <div className="text-sm text-gray-600">Type: {txn.type}</div>
          </div>
          <div className="text-right">
            <div className="flex gap-2 items-center">
              <Link href={`/transactions/${txn.id}/edit`} className="px-3 py-1 border rounded text-sm">Edit</Link>
              <button onClick={onDelete} disabled={deleting} className="px-3 py-1 bg-red-500 text-white rounded text-sm">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
            <div className="mt-2">
              <Link href="/transactions" className="text-sm text-blue-600 hover:underline">Back</Link>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-gray-700">Description: {txn.description || <span className="text-gray-400">(none)</span>}</div>
        </div>

        {txn.income_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Income</h2>
            <div className="p-3 border rounded mt-2">
              <div>Asset: {txn.income_txn.asset_id}</div>
              <div>Account: {txn.income_txn.account?.name}</div>
              <div>Quantity: {txn.income_txn.quantity}</div>
              <div>Allocations: {txn.income_txn.allocation_to_purpose_buckets?.map((a: any) => `${a.bucket?.name || a.purpose_bucket_id}: ${a.quantity}`).join(', ')}</div>
            </div>
          </section>
        )}

        {txn.expense_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Expense</h2>
            <div className="p-3 border rounded mt-2">
              <div>Asset: {txn.expense_txn.asset_id}</div>
              <div>Account: {txn.expense_txn.account?.name}</div>
              <div>Quantity: {txn.expense_txn.quantity}</div>
              <div>From Bucket: {txn.expense_txn.purpose_bucket?.name}</div>
            </div>
          </section>
        )}

        {txn.self_transfer_or_refundable_or_refund_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Transfer / Refund</h2>
            <div className="p-3 border rounded mt-2">
              <div>Asset: {txn.self_transfer_or_refundable_or_refund_txn.asset_id}</div>
              <div>From: {txn.self_transfer_or_refundable_or_refund_txn.from_account?.name}</div>
              <div>To: {txn.self_transfer_or_refundable_or_refund_txn.to_account?.name}</div>
              <div>Quantity: {txn.self_transfer_or_refundable_or_refund_txn.quantity}</div>
            </div>
          </section>
        )}

        {txn.asset_trade_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Asset Trade</h2>
            <div className="p-3 border rounded mt-2">
              <div>Debit: {txn.asset_trade_txn.debit_quantity} {txn.asset_trade_txn.debit_asset_id} (Account: {txn.asset_trade_txn.debit_account?.name})</div>
              <div>Credit: {txn.asset_trade_txn.credit_quantity} {txn.asset_trade_txn.credit_asset_id} (Account: {txn.asset_trade_txn.credit_account?.name})</div>
              <div>Replacements: {txn.asset_trade_txn.asset_replacement_in_purpose_buckets?.map((r: any) => `${r.purpose_bucket?.name || r.purpose_bucket_id} d:${r.debit_quantity} c:${r.credit_quantity}`).join('; ')}</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
