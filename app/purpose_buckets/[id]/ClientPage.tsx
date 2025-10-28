'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_purpose_bucket } from '@/server actions/purpose_bucket/delete';
import { delete_asset_reallocation_between_purpose_buckets } from '@/server actions/purpose_bucket/asset_reallocation_between_purpose_buckets/delete';
import { get_indian_date_from_date_obj } from '@/utils/date';
import { formatIndianCurrency } from '@/utils/format_currency';
import { toDecimal } from '@/utils/decimal';
import { Prisma } from '@/generated/prisma';

type BucketView = Prisma.purpose_bucketGetPayload<{
  include: {
    allocation_to_purpose_bucket: {
      include: {
        allocation_thru_income: { include: { account: true; asset: true } };
        allocation_thru_account_opening: { include: { account: true; asset: true } };
      };
    };
    expense_txn: { include: { account: true; asset: true } };
    asset_replacement_in_purpose_buckets: {
      include: {
        asset_trade_txn: {
          include: { debit_asset: true; credit_asset: true; debit_account: true; credit_account: true };
        };
      };
    };
    asset_reallocation_between_purpose_buckets_from: { include: { asset: true; to_purpose_bucket: true } };
    asset_reallocation_between_purpose_buckets_to: { include: { asset: true; from_purpose_bucket: true } };
  };
}>;
type CurrentAssets = {
  current_assets: {
    price: number | null;
    id: string;
    name: string;
    type?: any;
    code?: string | null | undefined;
    balance: number;
  }[];
};

export default function ClientPage({ initial_data }: { initial_data: BucketView & CurrentAssets }) {
  const bucket = initial_data;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deletingReallocId, setDeletingReallocId] = useState<string | null>(null);

  const currentAssets = bucket.current_assets || [];
  const totalValueDecimal = currentAssets.reduce(
    (s, a) => toDecimal(s).plus(a.price != null ? toDecimal(a.balance || 0).times(toDecimal(a.price)) : toDecimal(0)),
    toDecimal(0)
  );
  const totalValue = Number(totalValueDecimal.toFixed(2));
  const unknownPriceCount = currentAssets.filter(a => a.price == null).length;

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
          <h2 className="font-semibold mb-2">Current Assets</h2>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm text-gray-600">
              {currentAssets.length} asset{currentAssets.length === 1 ? '' : 's'}
            </div>
            <div className="text-right">
              <div className="font-semibold">Total value: {totalValue ? `₹${formatIndianCurrency(Math.round(totalValue * 100) / 100)}` : '—'}</div>
              {unknownPriceCount > 0 && (
                <div className="text-xs text-gray-500">
                  Note: {unknownPriceCount} asset{unknownPriceCount === 1 ? '' : 's'} missing price
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {currentAssets.map(a => (
              <div key={a.id} className="p-3 border rounded flex justify-between items-center">
                <div>
                  <div className="font-medium">
                    <Link href={`/assets/${a.id}`} className="text-blue-600 hover:underline">
                      {a.name}
                    </Link>
                  </div>
                  <div className="text-sm text-gray-500">Quantity: {a.balance}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">
                    {a.price != null
                      ? `₹${formatIndianCurrency(
                          Number(
                            toDecimal(a.balance || 0)
                              .times(toDecimal(a.price))
                              .toFixed(2)
                          )
                        )}`
                      : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Opening Balances</h2>
          <div className="space-y-2">
            {bucket.allocation_to_purpose_bucket
              .filter(a => a.allocation_thru_account_opening)
              .map(a => {
                const srcOpening = a.allocation_thru_account_opening!;
                const asset = srcOpening.asset;
                const sourceDate = srcOpening.date;
                return (
                  <div key={a.id} className="p-3 border rounded">
                    <div className="flex items-center justify-between">
                      <div>
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
                        {/* quantity */}
                        <div className="text-sm text-gray-600">Quantity: {a.quantity}</div>
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

                        <div className="text-sm text-gray-500">Date: {formatOnlyDate(sourceDate)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-semibold mb-2">Incomes</h2>
          <div className="space-y-2">
            {bucket.allocation_to_purpose_bucket
              .filter(a => a.allocation_thru_income)
              .map(e => (
                <div key={e.id} className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium"></div>
                      <div className="text-sm text-gray-600">
                        From:{' '}
                        <Link href={`/accounts/${e.allocation_thru_income!.account_id}`} className="text-blue-600 hover:underline">
                          {e.allocation_thru_income!.account.name}
                        </Link>
                      </div>
                      <div className="text-sm text-gray-600">
                        Asset:{' '}
                        <Link href={`/assets/${e.allocation_thru_income!.asset.id}`} className="text-blue-600 hover:underline">
                          {e.allocation_thru_income!.asset.name}
                        </Link>
                      </div>
                      <div className="text-sm text-gray-600">
                        Transaction:{' '}
                        <Link href={`/transactions/${e.allocation_thru_income!.transaction_id}`} className="text-blue-600 hover:underline">
                          {e.allocation_thru_income!.transaction_id}
                        </Link>
                      </div>
                      <div className="text-sm text-gray-500">Date: {formatOnlyDate(e.allocation_thru_income!.date)}</div>
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
