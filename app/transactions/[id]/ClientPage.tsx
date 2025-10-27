"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_transaction } from '@/server actions/transaction/delete';
import { formatIndianCurrency } from '@/utils/format_currency';
import { get_indian_date_from_date_obj } from '@/utils/date';

type IncomeView = {
  asset_id: string;
  asset?: { id: string; name: string; type: string };
  account?: { id: string; name: string };
  quantity: number;
  date?: string | Date;
  allocation_to_purpose_buckets?: { id?: string; purpose_bucket_id: string; quantity: number; bucket?: { id: string; name: string } }[];
};

type ExpenseView = { asset_id: string; asset?: { id: string; name: string; type: string }; account?: { id: string; name: string }; quantity: number; date?: string | Date; purpose_bucket?: { id: string; name: string } };

type TransferView = { asset_id: string; asset?: { id: string; name: string; type: string }; from_account?: { id: string; name: string }; to_account?: { id: string; name: string }; quantity: number; date?: string | Date };

type AssetTradeView = {
  debit_asset_id: string;
  debit_asset?: { id: string; name: string; type: string };
  debit_account?: { id: string; name: string };
  debit_quantity: number;
  debit_date?: string | Date;
  credit_asset_id: string;
  credit_asset?: { id: string; name: string; type: string };
  credit_account?: { id: string; name: string };
  credit_quantity: number;
  credit_date?: string | Date;
  asset_replacement_in_purpose_buckets?: { id?: string; purpose_bucket_id: string; debit_quantity: number; credit_quantity: number; purpose_bucket?: { id: string; name: string } }[];
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

  function fmtAmount(amount: number | undefined, assetType?: string) {
    if (amount === undefined || amount === null) return '-';
    if (assetType === 'rupees') return `₹ ${formatIndianCurrency(Number(amount))}`;
    return Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  function fmtDate(d: any) {
    if (!d) return '-';
    const dt = typeof d === 'string' ? new Date(d) : d;
    try {
      return get_indian_date_from_date_obj(new Date(dt));
    } catch {
      return dt.toLocaleDateString();
    }
  }

  const incomeAssetType = txn.income_txn?.asset?.type;
  const expenseAssetType = txn.expense_txn?.asset?.type;
  const transferAssetType = txn.self_transfer_or_refundable_or_refund_txn?.asset?.type;
  const debitAssetType = txn.asset_trade_txn?.debit_asset?.type;
  const creditAssetType = txn.asset_trade_txn?.credit_asset?.type;

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
              <div className="grid grid-cols-2 gap-2">
                <div>Asset: {txn.income_txn.asset ? <Link href={`/assets/${txn.income_txn.asset.id}`} className="text-blue-600 hover:underline">{txn.income_txn.asset.name}</Link> : <Link href={`/assets/${txn.income_txn.asset_id}`} className="text-blue-600 hover:underline">{txn.income_txn.asset_id}</Link>} {txn.income_txn.asset?.type && <span className="ml-2 text-xs text-gray-500">({txn.income_txn.asset.type})</span>}</div>
                <div className="text-right">Date: {fmtDate((txn.income_txn as any).date)}</div>
              </div>
              <div className="mt-2">Account: {txn.income_txn.account ? <Link href={`/accounts/${txn.income_txn.account.id}`} className="text-blue-600 hover:underline">{txn.income_txn.account.name}</Link> : '-'}</div>
              <div className="mt-1">Quantity: {fmtAmount(txn.income_txn.quantity, incomeAssetType)}</div>
                <div className="mt-3">
                  <h3 className="text-sm font-medium">Allocations</h3>
                  <ul className="mt-2 space-y-1">
                    {(txn.income_txn.allocation_to_purpose_buckets || []).map((a: any) => (
                      <li key={a.id ?? `${a.purpose_bucket_id}-${a.quantity}`} className="flex justify-between">
                        <div>{a.bucket ? <Link href={`/purpose_buckets/${a.bucket.id}`} className="text-blue-600 hover:underline">{a.bucket.name}</Link> : a.purpose_bucket_id}</div>
                        <div className="text-right">{fmtAmount(a.quantity, incomeAssetType)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
            </div>
          </section>
        )}

        {txn.expense_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Expense</h2>
            <div className="p-3 border rounded mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>Asset: {txn.expense_txn.asset ? <Link href={`/assets/${txn.expense_txn.asset.id}`} className="text-blue-600 hover:underline">{txn.expense_txn.asset.name}</Link> : <Link href={`/assets/${txn.expense_txn.asset_id}`} className="text-blue-600 hover:underline">{txn.expense_txn.asset_id}</Link>} {txn.expense_txn.asset?.type && <span className="ml-2 text-xs text-gray-500">({txn.expense_txn.asset.type})</span>}</div>
                <div className="text-right">Date: {fmtDate((txn.expense_txn as any).date)}</div>
              </div>
              <div className="mt-2">Account: {txn.expense_txn.account ? <Link href={`/accounts/${txn.expense_txn.account.id}`} className="text-blue-600 hover:underline">{txn.expense_txn.account.name}</Link> : '-'}</div>
              <div className="mt-1">Quantity: {fmtAmount(txn.expense_txn.quantity, expenseAssetType)}</div>
              <div className="mt-1">From Bucket: {txn.expense_txn.purpose_bucket ? <Link href={`/purpose_buckets/${txn.expense_txn.purpose_bucket.id}`} className="text-blue-600 hover:underline">{txn.expense_txn.purpose_bucket.name}</Link> : '-'}</div>
            </div>
          </section>
        )}

        {txn.self_transfer_or_refundable_or_refund_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Transfer / Refund</h2>
            <div className="p-3 border rounded mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>Asset: {txn.self_transfer_or_refundable_or_refund_txn.asset ? <Link href={`/assets/${txn.self_transfer_or_refundable_or_refund_txn.asset.id}`} className="text-blue-600 hover:underline">{txn.self_transfer_or_refundable_or_refund_txn.asset.name}</Link> : <Link href={`/assets/${txn.self_transfer_or_refundable_or_refund_txn.asset_id}`} className="text-blue-600 hover:underline">{txn.self_transfer_or_refundable_or_refund_txn.asset_id}</Link>} {txn.self_transfer_or_refundable_or_refund_txn.asset?.type && <span className="ml-2 text-xs text-gray-500">({txn.self_transfer_or_refundable_or_refund_txn.asset.type})</span>}</div>
                <div className="text-right">Date: {fmtDate((txn.self_transfer_or_refundable_or_refund_txn as any).date)}</div>
              </div>
              <div className="mt-2">From: {txn.self_transfer_or_refundable_or_refund_txn.from_account ? <Link href={`/accounts/${(txn.self_transfer_or_refundable_or_refund_txn.from_account as any).id}`} className="text-blue-600 hover:underline">{txn.self_transfer_or_refundable_or_refund_txn.from_account?.name}</Link> : '-'}</div>
              <div className="mt-1">To: {txn.self_transfer_or_refundable_or_refund_txn.to_account ? <Link href={`/accounts/${(txn.self_transfer_or_refundable_or_refund_txn.to_account as any).id}`} className="text-blue-600 hover:underline">{txn.self_transfer_or_refundable_or_refund_txn.to_account?.name}</Link> : '-'}</div>
              <div className="mt-1">Quantity: {fmtAmount(txn.self_transfer_or_refundable_or_refund_txn.quantity, transferAssetType)}</div>
            </div>
          </section>
        )}

        {txn.asset_trade_txn && (
          <section className="mt-4">
            <h2 className="font-semibold">Asset Trade</h2>
            <div className="p-3 border rounded mt-2">
              <div className="grid grid-cols-2 gap-2">
                <div>Debit: {fmtAmount(txn.asset_trade_txn.debit_quantity, debitAssetType)} {txn.asset_trade_txn.debit_asset ? <Link href={`/assets/${txn.asset_trade_txn.debit_asset.id}`} className="text-blue-600 hover:underline">{txn.asset_trade_txn.debit_asset.name}</Link> : <Link href={`/assets/${txn.asset_trade_txn.debit_asset_id}`} className="text-blue-600 hover:underline">{txn.asset_trade_txn.debit_asset_id}</Link>} (Account: {txn.asset_trade_txn.debit_account?.name})</div>
                <div className="text-right">Credit Date: {fmtDate((txn.asset_trade_txn as any).credit_date)}</div>
              </div>
              <div className="mt-1">Credit: {fmtAmount(txn.asset_trade_txn.credit_quantity, creditAssetType)} {txn.asset_trade_txn.credit_asset ? <Link href={`/assets/${txn.asset_trade_txn.credit_asset.id}`} className="text-blue-600 hover:underline">{txn.asset_trade_txn.credit_asset.name}</Link> : <Link href={`/assets/${txn.asset_trade_txn.credit_asset_id}`} className="text-blue-600 hover:underline">{txn.asset_trade_txn.credit_asset_id}</Link>} (Account: {txn.asset_trade_txn.credit_account?.name})</div>
              <div className="mt-3">
                <h3 className="text-sm font-medium">Replacements</h3>
                <div className="mt-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-600">
                        <th>Purpose bucket</th>
                        <th className="text-right">Debit</th>
                        <th className="text-right">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(txn.asset_trade_txn.asset_replacement_in_purpose_buckets || []).map((r: any) => (
                        <tr key={r.id ?? `${r.purpose_bucket_id}-${r.debit_quantity}`}>
                          <td className="py-1">{r.purpose_bucket ? <Link href={`/purpose_buckets/${r.purpose_bucket.id}`} className="text-blue-600 hover:underline">{r.purpose_bucket.name}</Link> : r.purpose_bucket_id}</td>
                          <td className="text-right">{fmtAmount(r.debit_quantity, debitAssetType)}</td>
                          <td className="text-right">{fmtAmount(r.credit_quantity, creditAssetType)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
