'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_asset } from '@/server actions/asset/delete';
import { formatIndianCurrency } from '@/utils/format_currency';
import { get_indian_date_from_date_obj } from '@/utils/date';

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
  console.log('Asset data:', asset);
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
          <h2 className="font-semibold mb-2">Opening Balances</h2>
          <div className="space-y-2">
            {asset.opening_balances.map((ob: OpeningBalance) => (
              <div key={ob.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">
                      <Link href={`/accounts/${ob.account.id}`} className="text-blue-600 hover:underline">
                        {ob.account.name}
                      </Link>
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
            {(asset.income_txn || []).map((t: IncomeTxn) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
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
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500">
                      <Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">
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
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
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
                    <div className="text-sm text-gray-500">
                      From bucket:{' '}
                      {t.purpose_bucket ? (
                        <Link href={`/purpose_buckets/${t.purpose_bucket.id}`} className="text-blue-600 hover:underline">
                          {t.purpose_bucket.name}
                        </Link>
                      ) : (
                        t.purpose_bucket_id
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{t.quantity}</div>
                    <div className="text-xs text-gray-500">
                      <Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">
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
                      )}
                      {' '}→ To:{' '}
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
                      <Link href={`/transactions/${t.transaction_id}`} className="text-blue-600 hover:underline">View</Link>
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
            {((asset.asset_trade_debit || []) as any).map((t: any) => (
              <div key={t.id} className="p-3 border rounded">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">
                      Debit Account:{' '}
                      {t.debit_account ? (
                        <Link href={`/accounts/${t.debit_account.id}`} className="text-blue-600 hover:underline">
                          {t.debit_account.name}
                        </Link>
                      ) : (
                        t.debit_account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Credit Account:{' '}
                      {t.credit_account ? (
                        <Link href={`/accounts/${t.credit_account.id}`} className="text-blue-600 hover:underline">
                          {t.credit_account.name}
                        </Link>
                      ) : (
                        t.credit_account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.debit_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">Debit: {t.debit_quantity}</div>
                    <div className="text-xs text-gray-500">
                      <Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {((asset.asset_trade_credit || []) as any).map((t: any) => (
              <div key={t.id} className="p-3 border rounded bg-green-50">
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">
                      Credit Account:{' '}
                      {t.credit_account ? (
                        <Link href={`/accounts/${t.credit_account.id}`} className="text-blue-600 hover:underline">
                          {t.credit_account.name}
                        </Link>
                      ) : (
                        t.credit_account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Debit Account:{' '}
                      {t.debit_account ? (
                        <Link href={`/accounts/${t.debit_account.id}`} className="text-blue-600 hover:underline">
                          {t.debit_account.name}
                        </Link>
                      ) : (
                        t.debit_account_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(t.credit_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">Credit: {t.credit_quantity}</div>
                    <div className="text-xs text-gray-500">
                      <Link href={`/transactions/${t.id}`} className="text-blue-600 hover:underline">
                        View
                      </Link>
                    </div>
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
