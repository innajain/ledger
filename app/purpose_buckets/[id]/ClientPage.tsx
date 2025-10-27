'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_purpose_bucket } from '@/server actions/purpose_bucket/delete';
import { delete_asset_reallocation_between_purpose_buckets } from '@/server actions/purpose_bucket/asset_reallocation_between_purpose_buckets/delete';
import { get_indian_date_from_date_obj } from '@/utils/date';

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
  asset_reallocation_between_purpose_buckets_from?: any[];
  asset_reallocation_between_purpose_buckets_to?: any[];
  asset_replacement_in_purpose_buckets?: any[];
};

export default function ClientPage({ initial_data }: { initial_data: BucketView }) {
  const bucket = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deletingReallocId, setDeletingReallocId] = useState<string | null>(null);

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

  function formatOnlyDate(d: string | Date | undefined) {
    if (!d) return '-';
    try {
      const dt = typeof d === 'string' ? new Date(d) : d;
      return get_indian_date_from_date_obj(new Date(dt));
    } catch (e) {
      return String(d).split('T')[0];
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
              <Link href={`/purpose_buckets/${bucket.id}/edit`} className="px-3 py-1 border rounded text-sm">
                Edit
              </Link>
              <button onClick={onDelete} disabled={deleting} className="px-3 py-1 bg-red-500 text-white rounded text-sm">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
            <div className="mt-2">
              <Link href="/purpose_buckets" className="text-sm text-blue-600 hover:underline">
                Back
              </Link>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Allocations</h2>
          <div className="space-y-2">
            {bucket.allocation_to_purpose_bucket.map((a: any) => {
              const srcIncome = a.allocation_thru_income;
              const srcOpening = a.allocation_thru_account_opening;
              const sourceType = srcIncome ? 'Income' : srcOpening ? 'Opening' : 'Unknown';
              const asset = srcIncome?.asset || srcOpening?.asset;
              const sourceDate = srcIncome?.date || srcOpening?.date;
              console.log(srcIncome, srcOpening);
              return (
                <div key={a.id} className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{sourceType} Allocation</div>
                      <div className="text-sm text-gray-600">
                        Asset:{' '}
                        {asset ? (
                          <Link href={`/assets/${asset.id}`} className="text-blue-600 hover:underline">
                            {asset.name}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </div>
                      {srcOpening && (
                        <div className="text-sm text-gray-600">
                          Account:{' '}
                          {
                            <Link href={`/accounts/${srcOpening.account_id}`} className="text-blue-600 hover:underline">
                              {srcOpening.account.name}
                            </Link>
                          }
                        </div>
                      )}
                      {srcIncome && (
                        <div className="text-sm text-gray-600">
                          Transaction:{' '}
                          {
                            <Link href={`/transactions/${srcIncome.transaction_id}`} className="text-blue-600 hover:underline">
                              {srcIncome.transaction_id}
                            </Link>
                          }
                        </div>
                      )}
                      <div className="text-sm text-gray-500">Date: {formatOnlyDate(sourceDate)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Reallocations</h2>
          <div className="space-y-2">
            {((bucket.asset_reallocation_between_purpose_buckets_from || []) as any).map((r: any) => (
              <div key={r.id} className="p-3 border rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Moved out</div>
                    <div className="text-sm text-gray-600">
                      To:{' '}
                      {r.to_purpose_bucket ? (
                        <Link href={`/purpose_buckets/${r.to_purpose_bucket.id}`} className="text-blue-600 hover:underline">
                          {r.to_purpose_bucket.name}
                        </Link>
                      ) : (
                        r.to_purpose_bucket_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Asset:{' '}
                      {r.asset ? (
                        <Link href={`/assets/${r.asset.id}`} className="text-blue-600 hover:underline">
                          {r.asset.name}
                        </Link>
                      ) : (
                        r.asset_id
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{r.quantity}</div>
                    <div className="text-xs text-gray-500">{formatOnlyDate(r.date)}</div>
                    <div className="mt-2 flex gap-2 justify-end">
                      <Link href={`/purpose_buckets/asset_reallocations/${r.id}/edit`} className="text-sm px-2 py-1 border rounded">
                        Edit
                      </Link>
                      <button
                        disabled={deletingReallocId === r.id}
                        onClick={async () => {
                          if (!confirm('Delete this reallocation?')) return;
                          try {
                            setDeletingReallocId(r.id);
                            await delete_asset_reallocation_between_purpose_buckets(r.id);
                            router.refresh();
                          } catch (err: any) {
                            alert(err?.message || String(err));
                          } finally {
                            setDeletingReallocId(null);
                          }
                        }}
                        className="text-sm px-2 py-1 bg-red-500 text-white rounded"
                      >
                        {deletingReallocId === r.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {((bucket.asset_reallocation_between_purpose_buckets_to || []) as any).map((r: any) => (
              <div key={r.id} className="p-3 border rounded bg-green-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Moved in</div>
                    <div className="text-sm text-gray-600">
                      From:{' '}
                      {r.from_purpose_bucket ? (
                        <Link href={`/purpose_buckets/${r.from_purpose_bucket.id}`} className="text-blue-600 hover:underline">
                          {r.from_purpose_bucket.name}
                        </Link>
                      ) : (
                        r.from_purpose_bucket_id
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Asset:{' '}
                      {r.asset ? (
                        <Link href={`/assets/${r.asset.id}`} className="text-blue-600 hover:underline">
                          {r.asset.name}
                        </Link>
                      ) : (
                        r.asset_id
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{r.quantity}</div>
                    <div className="text-xs text-gray-500">{formatOnlyDate(r.date)}</div>
                    <div className="mt-2 flex gap-2 justify-end">
                      <Link href={`/purpose_buckets/asset_reallocations/${r.id}/edit`} className="text-sm px-2 py-1 border rounded">
                        Edit
                      </Link>
                      <button
                        disabled={deletingReallocId === r.id}
                        onClick={async () => {
                          if (!confirm('Delete this reallocation?')) return;
                          try {
                            setDeletingReallocId(r.id);
                            await delete_asset_reallocation_between_purpose_buckets(r.id);
                            router.refresh();
                          } catch (err: any) {
                            alert(err?.message || String(err));
                          } finally {
                            setDeletingReallocId(null);
                          }
                        }}
                        className="text-sm px-2 py-1 bg-red-500 text-white rounded"
                      >
                        {deletingReallocId === r.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
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
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium"></div>
                    <div className="text-sm text-gray-600">
                      From:{' '}
                      <Link href={`/accounts/${e.asset.id}`} className="text-blue-600 hover:underline">
                        {e.account.name}
                      </Link>
                    </div>
                    <div className="text-sm text-gray-600">
                      Asset:{' '}
                      <Link href={`/assets/${e.asset.id}`} className="text-blue-600 hover:underline">
                        {e.asset.name}
                      </Link>
                    </div>
                    <div className="text-sm text-gray-600">
                      Transaction:{' '}
                      <Link href={`/transactions/${e.transaction_id}`} className="text-blue-600 hover:underline">
                        {e.transaction_id}
                      </Link>
                    </div>
                    <div className="text-sm text-gray-500">Date: {formatOnlyDate(e.date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{e.quantity}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Replacements</h2>
          <div className="space-y-2">
            {((bucket.asset_replacement_in_purpose_buckets || []) as any).map((r: any) => (
              <div key={r.id} className="p-3 border rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Replacement</div>
                    <div className="text-sm text-gray-600">
                      Txn:{' '}
                      {r.asset_trade_txn ? (
                        <Link href={`/transactions/${r.asset_trade_txn.id}`} className="text-blue-600 hover:underline">
                          {r.asset_trade_txn.id}
                        </Link>
                      ) : (
                        r.asset_trade_txn_id
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      Debit: {r.debit_quantity}{' '}
                      {r.asset_trade_txn?.debit_asset ? (
                        <Link href={`/assets/${r.asset_trade_txn.debit_asset.id}`} className="text-blue-600 hover:underline">
                          {r.asset_trade_txn.debit_asset.name}
                        </Link>
                      ) : (
                        r.asset_trade_txn?.debit_asset_id
                      )}{' '}
                      {r.asset_trade_txn?.debit_account ? (
                        <>
                          (@{' '}
                          <Link href={`/accounts/${r.asset_trade_txn.debit_account.id}`} className="text-blue-600 hover:underline">
                            {r.asset_trade_txn.debit_account.name}
                          </Link>
                          )
                        </>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-600">
                      Credit: {r.credit_quantity}{' '}
                      {r.asset_trade_txn?.credit_asset ? (
                        <Link href={`/assets/${r.asset_trade_txn.credit_asset.id}`} className="text-blue-600 hover:underline">
                          {r.asset_trade_txn.credit_asset.name}
                        </Link>
                      ) : (
                        r.asset_trade_txn?.credit_asset_id
                      )}{' '}
                      {r.asset_trade_txn?.credit_account ? (
                        <>
                          (@{' '}
                          <Link href={`/accounts/${r.asset_trade_txn.credit_account.id}`} className="text-blue-600 hover:underline">
                            {r.asset_trade_txn.credit_account.name}
                          </Link>
                          )
                        </>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-500">
                      Date: {formatOnlyDate(r.asset_trade_txn?.debit_date || r.asset_trade_txn?.credit_date)}
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
