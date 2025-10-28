'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_asset } from '@/server actions/asset/delete';
import { formatIndianCurrency } from '@/utils/format_currency';
import { get_indian_date_from_date_obj } from '@/utils/date';
import { toDecimal } from '@/utils/decimal';

type Alloc = { id: string; quantity: number; bucket?: { id: string; name: string } };
type OpeningBalance = {
  id: string;
  quantity: number;
  date: string | Date;
  account: { id: string; name: string };
  allocation_to_purpose_buckets: Alloc[];
};

type IncomeTxn = {
  id: string;
  date: string | Date;
  account?: { id: string; name: string };
  account_id?: string;
  quantity: number;
  allocation_to_purpose_buckets?: Alloc[];
  description?: string | null;
  transaction_id: string;
};
type ExpenseTxn = {
  id: string;
  date: string | Date;
  account?: { id: string; name: string };
  account_id?: string;
  quantity: number;
  purpose_bucket?: { id: string; name: string };
  purpose_bucket_id?: string;
  description?: string | null;
  transaction_id: string;
};

type AssetView = {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  price?: number | null;
  opening_balances: OpeningBalance[];
  income_txn?: IncomeTxn[];
  expense_txn?: ExpenseTxn[];
  self_transfer_or_refundable_or_refund_txn: ({
    from_account: {
      id: string;
      name: string;
    };
    to_account: {
      id: string;
      name: string;
    };
  } & {
    id: string;
    date: Date;
    transaction_id: string;
    asset_id: string;
    from_account_id: string;
    to_account_id: string;
    quantity: number;
  })[];
  asset_trade_debit?: any[];
  asset_trade_credit?: any[];
};

export default function ClientPage({ initial_data }: { initial_data: AssetView }) {
  const asset = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

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
            <div className="text-sm text-gray-600">
              Type: {asset.type} {asset.code ? `• ${asset.code}` : ''}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{asset.price ? `₹${formatIndianCurrency(asset.price)}` : '—'}</div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                <Link href={`/assets/${asset.id}/edit`} className="px-3 py-1 border rounded text-sm">
                  Edit
                </Link>
                <button onClick={onDelete} disabled={deleting} className="px-3 py-1 bg-red-500 text-white rounded text-sm">
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
              <Link href="/assets" className="text-sm text-blue-600 hover:underline">
                Back
              </Link>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Current balances</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {(() => {
              // compute per-account balances for this asset
              const map = new Map<string, { account?: { id: string; name: string }; balance: any }>();

              function ensureAccount(id?: string, name?: string) {
                if (!id) return undefined;
                if (!map.has(id)) map.set(id, { account: name ? { id, name } : undefined, balance: toDecimal(0) });
                const rec = map.get(id)!;
                if (!rec.account && name) rec.account = { id, name };
                return rec;
              }

              // openings
              (asset.opening_balances || []).forEach((ob: OpeningBalance) => {
                const r = ensureAccount(ob.account.id, ob.account.name);
                if (r) r.balance = r.balance.plus(toDecimal(ob.quantity));
              });

              // income
              (asset.income_txn || []).forEach((t: IncomeTxn) => {
                const id = t.account?.id || t.account_id;
                const r = ensureAccount(id, t.account?.name);
                if (r) r.balance = r.balance.plus(toDecimal(t.quantity));
              });

              // expense
              (asset.expense_txn || []).forEach((t: ExpenseTxn) => {
                const id = t.account?.id || t.account_id;
                const r = ensureAccount(id, t.account?.name);
                if (r) r.balance = r.balance.minus(toDecimal(t.quantity));
              });

              // self transfers
              (asset.self_transfer_or_refundable_or_refund_txn || []).forEach((t: any) => {
                const fromId = t.from_account?.id || t.from_account_id;
                const toId = t.to_account?.id || t.to_account_id;
                const rFrom = ensureAccount(fromId, t.from_account?.name);
                const rTo = ensureAccount(toId, t.to_account?.name);
                if (rFrom) rFrom.balance = rFrom.balance.minus(toDecimal(t.quantity));
                if (rTo) rTo.balance = rTo.balance.plus(toDecimal(t.quantity));
              });

              // asset trades: debit reduces from debit_account, credit adds to credit_account
              (asset.asset_trade_debit || []).forEach((d: any) => {
                const id = d.debit_account?.id || d.debit_account_id;
                const r = ensureAccount(id, d.debit_account?.name);
                if (r) r.balance = r.balance.minus(toDecimal(d.debit_quantity ?? 0));
              });
              (asset.asset_trade_credit || []).forEach((c: any) => {
                const id = c.credit_account?.id || c.credit_account_id;
                const r = ensureAccount(id, c.credit_account?.name);
                if (r) r.balance = r.balance.plus(toDecimal(c.credit_quantity ?? 0));
              });

              const rows = Array.from(map.values()).filter(r => !r.balance.equals(toDecimal(0)));

              if (!rows.length) return <div className="text-sm text-gray-500">No current balances</div>;

              return rows.map(r => (
                <div key={r.account?.id ?? Math.random()} className="p-4 bg-white border rounded shadow-sm flex items-center justify-between">
                  <div>
                    {r.account ? (
                      <Link href={`/accounts/${r.account.id}`} className="font-medium text-blue-600 hover:underline">{r.account.name}</Link>
                    ) : (
                      <div className="font-medium">Unknown Account</div>
                    )}
                    <div className="text-sm text-gray-500">Balance: <span className="font-semibold text-gray-800">{r.balance.toString()}</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Current value</div>
                    <div className="text-lg font-bold">{asset.price ? `₹${formatIndianCurrency(r.balance.times(toDecimal(asset.price)))}` : '—'}</div>
                  </div>
                </div>
              ));
            })()}
          </div>

        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Opening Balances</h2>
          <div className="space-y-2">
            {asset.opening_balances.map((ob: OpeningBalance) => (
                <div key={ob.id} className="p-3 border rounded bg-white">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">
                      <Link href={`/accounts/${ob.account.id}`} className="text-blue-600 hover:underline">
                        {ob.account.name}
                      </Link>
                    </div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(ob.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{ob.quantity}</div>
                    <div className="text-sm text-gray-600">{asset.price ? `₹${formatIndianCurrency(toDecimal(ob.quantity).times(toDecimal(asset.price)))}` : '—'}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Income Transactions</h2>
          <div className="space-y-2">
            {(asset.income_txn || []).map((t: IncomeTxn) => (
              <div key={t.id} className="p-3 border rounded bg-white">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">
                      {t.account ? (
                        <Link href={`/accounts/${t.account.id}`} className="text-blue-600 hover:underline">
                          {t.account.name}
                        </Link>
                      ) : (
                        t.account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{formatOnlyDate(t.date)}</div>
                    {t.description && <div className="text-sm text-gray-600 mt-1">{t.description}</div>}
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-sm text-gray-600">{asset.price ? `₹${formatIndianCurrency(toDecimal(t.quantity).times(toDecimal(asset.price)))}` : '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      <Link href={`/transactions/${t.transaction_id}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Expense Transactions</h2>
          <div className="space-y-2">
            {(asset.expense_txn || []).map((t: ExpenseTxn) => (
              <div key={t.id} className="p-3 border rounded bg-white">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">
                      {t.account ? (
                        <Link href={`/accounts/${t.account.id}`} className="text-blue-600 hover:underline">
                          {t.account.name}
                        </Link>
                      ) : (
                        t.account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{formatOnlyDate(t.date)}</div>
                    <div className="text-sm text-gray-500">From bucket: {t.purpose_bucket ? (
                        <Link href={`/purpose_buckets/${t.purpose_bucket.id}`} className="text-blue-600 hover:underline">
                          {t.purpose_bucket.name}
                        </Link>
                      ) : (
                        t.purpose_bucket_id
                      )}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-sm text-gray-600">{asset.price ? `₹${formatIndianCurrency(toDecimal(t.quantity).times(toDecimal(asset.price)))}` : '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      <Link href={`/transactions/${t.transaction_id}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Self Transfers / Refunds</h2>
          <div className="space-y-2">
            {(asset.self_transfer_or_refundable_or_refund_txn || []).map((t: any) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">
                      From:{' '}
                      {t.from_account ? (
                        <Link href={`/accounts/${t.from_account.id}`} className="text-blue-600 hover:underline">
                          {t.from_account.name}
                        </Link>
                      ) : (
                        t.from_account_id
                      )}{' '}
                      → To:{' '}
                      {t.to_account ? (
                        <Link href={`/accounts/${t.to_account.id}`} className="text-blue-600 hover:underline">
                          {t.to_account.name}
                        </Link>
                      ) : (
                        t.to_account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500">
                      <Link href={`/transactions/${t.transaction_id}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Asset Trades</h2>
          <div className="space-y-2">
            {/* Combine debit and credit entries into a single tile per transaction */}
            {(() => {
              const map = new Map<string, { id?: string; transaction_id: string; debit?: any; credit?: any }>();
              (asset.asset_trade_debit || []).forEach((d: any) => {
                const key = d.transaction_id || d.id;
                const existing = map.get(key) || { id: d.id, transaction_id: d.transaction_id, debit: undefined, credit: undefined };
                existing.debit = d;
                existing.id = existing.id || d.id;
                map.set(key, existing);
              });
              (asset.asset_trade_credit || []).forEach((c: any) => {
                const key = c.transaction_id || c.id;
                const existing = map.get(key) || { id: c.id, transaction_id: c.transaction_id, debit: undefined, credit: undefined };
                existing.credit = c;
                existing.id = existing.id || c.id;
                map.set(key, existing);
              });

              const trades = Array.from(map.values());

              return trades.map(t => {
                const d = t.debit;
                const c = t.credit;
                return (
                  <div key={t.id || t.transaction_id} className="p-3 border rounded bg-white">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="font-medium">
                          <span className="mr-2">Transaction:</span>
                          <Link href={`/transactions/${t.transaction_id}`} className="text-blue-600 hover:underline">
                            {t.transaction_id}
                          </Link>
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <div className="text-sm text-gray-600">Debit</div>
                            <div className="text-sm">
                              {d?.debit_account ? (
                                <Link href={`/accounts/${d.debit_account.id}`} className="text-blue-600 hover:underline">
                                  {d.debit_account.name}
                                </Link>
                              ) : (
                                d?.debit_account_id ?? '-'
                              )}
                            </div>
                            <div className="text-sm text-gray-700 font-semibold">{d?.debit_quantity ?? '-'}</div>
                            <div className="text-xs text-gray-600">{asset.price ? `₹${formatIndianCurrency(toDecimal(d?.debit_quantity ?? 0).times(toDecimal(asset.price)))}` : '—'}</div>
                          </div>

                          <div>
                            <div className="text-sm text-gray-600">Credit</div>
                            <div className="text-sm">
                              {c?.credit_account ? (
                                <Link href={`/accounts/${c.credit_account.id}`} className="text-blue-600 hover:underline">
                                  {c.credit_account.name}
                                </Link>
                              ) : (
                                c?.credit_account_id ?? '-'
                              )}
                            </div>
                            <div className="text-sm text-gray-700 font-semibold">{c?.credit_quantity ?? '-'}</div>
                            <div className="text-xs text-gray-600">{asset.price ? `₹${formatIndianCurrency(toDecimal(c?.credit_quantity ?? 0).times(toDecimal(asset.price)))}` : '—'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-sm text-gray-500">
                        <div>Date: {formatOnlyDate(d?.debit_date ?? c?.credit_date)}</div>
                        <div className="mt-2 text-xs">
                          <Link href={`/transactions/${t.transaction_id}`} className="text-blue-600 hover:underline">
                            View
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      </div>
    </div>
  );
}
