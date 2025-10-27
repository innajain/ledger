"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_account } from '@/server actions/account/delete';
import { get_indian_date_from_date_obj } from '@/utils/date';
import { formatIndianCurrency } from '@/utils/format_currency';

type Alloc = { id: string; quantity: number; bucket?: { id: string; name: string } };
type OpeningBalance = { id: string; quantity: number; date: string | Date; asset: { id: string; name: string }; allocation_to_purpose_buckets: Alloc[] };

type AccountView = {
  id: string;
  name: string;
  opening_balances: OpeningBalance[];
  income_txn?: any[];
  expense_txn?: any[];
  self_transfer_or_refundable_or_refund_txn_from?: any[];
  self_transfer_or_refundable_or_refund_txn_to?: any[];
  asset_trade_debit?: any[];
  asset_trade_credit?: any[];
  current_assets?: { id: string; name: string; balance: number; price?: number | null }[];
};

export default function ClientPage({ initial_data }: { initial_data: AccountView }) {
  const acc = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const currentAssets = acc.current_assets || [];
  const totalValue = currentAssets.reduce((s, a) => s + ((a.price != null ? (a.balance || 0) * a.price : 0)), 0);
  const unknownPriceCount = currentAssets.filter(a => a.price == null).length;

  function formatOnlyDate(d: string | Date | undefined) {
    if (!d) return '-';
    try {
      const dt = typeof d === 'string' ? new Date(d) : d;
      return get_indian_date_from_date_obj(new Date(dt));
    } catch (e) {
      return String(d).split('T')[0];
    }
  }

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
          <h2 className="font-semibold mb-2">Current Assets</h2>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-gray-600">{currentAssets.length} asset{currentAssets.length === 1 ? '' : 's'}</div>
            <div className="text-right">
              <div className="font-semibold">Total value: {totalValue ? `₹${formatIndianCurrency(Math.round(totalValue * 100) / 100)}` : '—'}</div>
              {unknownPriceCount > 0 && (
                <div className="text-xs text-gray-500">Note: {unknownPriceCount} asset{unknownPriceCount === 1 ? '' : 's'} missing price</div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {(acc.current_assets || []).map((a) => (
              <div key={a.id} className="p-3 border rounded flex justify-between items-center">
                <div>
                  <div className="font-medium"><Link href={`/assets/${a.id}`} className="text-blue-600 hover:underline">{a.name}</Link></div>
                  <div className="text-sm text-gray-500">Quantity: {a.balance}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Price: {a.price != null ? `₹${formatIndianCurrency(a.price)}` : '—'}</div>
                  <div className="font-bold">Value: {a.price != null ? `₹${formatIndianCurrency(Math.round((a.balance || 0) * a.price * 100) / 100)}` : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Opening Balances</h2>
          <div className="space-y-2">
            {acc.opening_balances.map((ob: OpeningBalance) => (
              <div key={ob.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <Link href={`/assets/${ob.asset.id}`} className="text-blue-600 hover:underline">{ob.asset.name}</Link>
                    <div className="text-sm text-gray-500">{formatOnlyDate(ob.date)}</div>
                    <div className="text-sm text-gray-500">Allocations: {ob.allocation_to_purpose_buckets.reduce((s: number, a: Alloc) => s + a.quantity, 0)}</div>
                    <div className="mt-2 text-sm">
                      {ob.allocation_to_purpose_buckets.map(a => (
                        <div key={a.id} className="text-xs text-gray-600">• {a.bucket ? <Link href={`/purpose_buckets/${a.bucket.id}`} className="text-blue-600 hover:underline">{a.bucket.name}</Link> : 'Unknown'}: {a.quantity}</div>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{ob.quantity}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Income Transactions</h2>
          <div className="space-y-2">
            {(acc.income_txn || []).map((t: any) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{t.asset ? <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">{t.asset.name}</Link> : 'Income'}</div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500"><Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">View</Link></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Expense Transactions</h2>
          <div className="space-y-2">
            {(acc.expense_txn || []).map((t: any) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{t.asset ? <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">{t.asset.name}</Link> : 'Expense'}</div>
                    <div className="text-sm text-gray-500">Bucket: {t.purpose_bucket ? <Link href={`/purpose_buckets/${t.purpose_bucket.id}`} className="text-blue-600 hover:underline">{t.purpose_bucket.name}</Link> : '-'}</div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500"><Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">View</Link></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Self Transfers / Refunds</h2>
          <div className="space-y-2">
            {((acc.self_transfer_or_refundable_or_refund_txn_from || []) as any).map((t: any) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">To: {t.to_account ? <Link href={`/accounts/${t.to_account.id}`} className="text-blue-600 hover:underline">{t.to_account.name}</Link> : t.to_account_id}</div>
                    <div className="text-sm text-gray-500">Asset: {t.asset ? <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">{t.asset.name}</Link> : '-'}</div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500"><Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">View</Link></div>
                  </div>
                </div>
              </div>
            ))}

            {((acc.self_transfer_or_refundable_or_refund_txn_to || []) as any).map((t: any) => (
              <div key={t.id} className="p-3 border rounded bg-green-50">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">From: {t.from_account ? <Link href={`/accounts/${t.from_account.id}`} className="text-blue-600 hover:underline">{t.from_account.name}</Link> : t.from_account_id}</div>
                    <div className="text-sm text-gray-500">Asset: {t.asset ? <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">{t.asset.name}</Link> : '-'}</div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500"><Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">View</Link></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Asset Trades</h2>
          <div className="space-y-2">
            {((acc.asset_trade_debit || []) as any).map((t: any) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">Debit Asset: {t.debit_asset ? <Link href={`/assets/${t.debit_asset.id}`} className="text-blue-600 hover:underline">{t.debit_asset.name}</Link> : t.debit_asset_id}</div>
                    <div className="text-sm text-gray-500">Credit Asset: {t.credit_asset ? <Link href={`/assets/${t.credit_asset.id}`} className="text-blue-600 hover:underline">{t.credit_asset.name}</Link> : t.credit_asset_id}</div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.debit_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">Debit: {t.debit_quantity}</div>
                    <div className="text-xs text-gray-500"><Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">View</Link></div>
                  </div>
                </div>
              </div>
            ))}

            {((acc.asset_trade_credit || []) as any).map((t: any) => (
              <div key={t.id} className="p-3 border rounded bg-green-50">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">Credit Asset: {t.credit_asset ? <Link href={`/assets/${t.credit_asset.id}`} className="text-blue-600 hover:underline">{t.credit_asset.name}</Link> : t.credit_asset_id}</div>
                    <div className="text-sm text-gray-500">Debit Asset: {t.debit_asset ? <Link href={`/assets/${t.debit_asset.id}`} className="text-blue-600 hover:underline">{t.debit_asset.name}</Link> : t.debit_asset_id}</div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.credit_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">Credit: {t.credit_quantity}</div>
                    <div className="text-xs text-gray-500"><Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">View</Link></div>
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
