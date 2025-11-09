'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { asset, Prisma } from '@/generated/prisma/wasm';

type PurposeBucketView = Prisma.purpose_bucketGetPayload<{
  include: {
    allocation_to_purpose_buckets: {
      include: {
        allocation_thru_account_opening: { include: { asset: true; account: true } };
        allocation_thru_income: { include: { asset: true; transaction: true } };
      };
    };
    expense_txn: { include: { account: true; asset: true; transaction: true } };
    asset_reallocation_between_purpose_buckets_from: { include: { asset: true; to_purpose_bucket: true } };
    asset_reallocation_between_purpose_buckets_to: { include: { asset: true; from_purpose_bucket: true } };
    asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: { include: { debit_asset: true; credit_asset: true; transaction: true } } } };
  };
}> & {
  monetary_value: number;
  asset_balances: (asset & {
    monetary_value: number | null | undefined;
    price:
      | {
          price: number;
          date: Date;
        }
      | null
      | undefined;
    balance: number;
  })[];
};

// Mock utility functions - replace with your actual imports
const format_indian_currency = (value: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

const get_indian_date_from_date_obj = (date: Date) => {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export default function ClientPage({ bucket_with_asset_balances_values }: { bucket_with_asset_balances_values: PurposeBucketView }) {
  const bucket = bucket_with_asset_balances_values;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const assetBalances = bucket.asset_balances;

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
    if (!confirm('Delete this purpose bucket? This cannot be undone.')) return;
    setDeleting(true);
    try {
      // await delete_purpose_bucket(bucket.id);
      alert('Delete functionality not implemented');
      // router.push('/purpose_buckets');
    } catch (err: any) {
      alert(err?.message || String(err));
    } finally {
      setDeleting(false);
    }
  }

  const SectionHeader = ({ children, count }: { children: React.ReactNode; count?: number }) => (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-lg font-semibold text-gray-900">{children}</h2>
      {count !== undefined && count > 0 && <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">{count}</span>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Back Button */}
        <Link href="/purpose_buckets" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Purpose Buckets
        </Link>

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{bucket.name}</h1>
                  <div className="text-sm text-gray-500 font-mono">ID: {bucket.id}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
                <div className="text-sm text-gray-600 mb-1">Total Bucket Value</div>
                <div className="text-2xl font-bold text-gray-900">{format_indian_currency(bucket.monetary_value)}</div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/purpose_buckets/${bucket.id}/edit`}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
                >
                  Edit
                </Link>
                <button
                  onClick={onDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Asset Balances */}
        {assetBalances.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <SectionHeader count={assetBalances.length}>Asset Balances</SectionHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-2">
              {assetBalances.map(a => (
                <div
                  key={a.id}
                  className="group p-5 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/assets/${a.id}`} className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {a.name}
                    </Link>
                    <svg
                      className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Balance</div>
                      <div className="text-2xl font-bold text-gray-900">{a.balance}</div>
                    </div>
                    {a.price?.price != null && (
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Value</div>
                        <div className="text-lg font-semibold text-emerald-600">
                          {format_indian_currency(Math.round((a.balance || 0) * a.price.price * 100) / 100)}
                        </div>
                      </div>
                    )}
                  </div>
                  {a.price?.price != null && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500">Price: {format_indian_currency(a.price.price)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Sections */}
        <div className="space-y-6">
          {/* Allocations */}
          {bucket.allocation_to_purpose_buckets.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader count={bucket.allocation_to_purpose_buckets.length}>Allocations</SectionHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* From Income */}
                {bucket.allocation_to_purpose_buckets.filter(a => a.allocation_thru_income).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>From Income Transactions</span>
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        {bucket.allocation_to_purpose_buckets.filter(a => a.allocation_thru_income).length}
                      </span>
                    </h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {bucket.allocation_to_purpose_buckets
                        .filter(a => a.allocation_thru_income)
                        .map(alloc => (
                          <div key={alloc.id} className="p-4 border border-green-200 bg-green-50/30 rounded-lg hover:bg-green-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                {alloc.allocation_thru_income?.asset && (
                                  <Link
                                    href={`/assets/${alloc.allocation_thru_income.asset.id}`}
                                    className="font-medium text-blue-600 hover:text-blue-700 block mb-1"
                                  >
                                    {alloc.allocation_thru_income.asset.name}
                                  </Link>
                                )}
                                <div className="text-xs text-gray-500">
                                  {formatOnlyDate(alloc.allocation_thru_income?.transaction?.date)}
                                </div>
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-lg font-bold text-green-600">+{alloc.quantity}</div>
                                {alloc.allocation_thru_income?.transaction_id && (
                                  <Link
                                    href={`/transactions/${alloc.allocation_thru_income.transaction_id}`}
                                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                                  >
                                    View →
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* From Opening Balance */}
                {bucket.allocation_to_purpose_buckets.filter(a => a.allocation_thru_account_opening).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>From Opening Balances</span>
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                        {bucket.allocation_to_purpose_buckets.filter(a => a.allocation_thru_account_opening).length}
                      </span>
                    </h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {bucket.allocation_to_purpose_buckets
                        .filter(a => a.allocation_thru_account_opening)
                        .map(alloc => (
                          <div key={alloc.id} className="p-4 border border-blue-200 bg-blue-50/30 rounded-lg hover:bg-blue-50 transition-colors">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                {alloc.allocation_thru_account_opening?.account && (
                                  <Link
                                    href={`/accounts/${alloc.allocation_thru_account_opening.account.id}`}
                                    className="font-medium text-blue-600 hover:text-blue-700 block mb-1"
                                  >
                                    {alloc.allocation_thru_account_opening.account.name}
                                  </Link>
                                )}
                                {alloc.allocation_thru_account_opening?.asset && (
                                  <div className="text-xs text-gray-600 mb-1">
                                    <Link
                                      href={`/assets/${alloc.allocation_thru_account_opening.asset.id}`}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {alloc.allocation_thru_account_opening.asset.name}
                                    </Link>
                                  </div>
                                )}
                                <div className="text-xs text-gray-500">{formatOnlyDate(alloc.allocation_thru_account_opening?.date)}</div>
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-lg font-bold text-blue-600">+{alloc.quantity}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Expenses */}
          {bucket.expense_txn.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader count={bucket.expense_txn.length}>Expenses</SectionHeader>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {bucket.expense_txn.map(exp => (
                  <div key={exp.id} className="p-4 border border-red-200 bg-red-50/30 rounded-lg hover:bg-red-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        {exp.asset && (
                          <Link href={`/assets/${exp.asset.id}`} className="font-medium text-blue-600 hover:text-blue-700 block mb-1">
                            {exp.asset.name}
                          </Link>
                        )}
                        {exp.account && (
                          <div className="text-xs text-gray-600 mb-1">
                            Account:{' '}
                            <Link href={`/accounts/${exp.account.id}`} className="text-blue-600 hover:underline">
                              {exp.account.name}
                            </Link>
                          </div>
                        )}
                        <div className="text-xs text-gray-500">{formatOnlyDate(exp.transaction?.date)}</div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-lg font-bold text-red-600">-{exp.quantity}</div>
                        <Link href={`/transactions/${exp.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                          View →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Asset Reallocations */}
          {(bucket.asset_reallocation_between_purpose_buckets_from.length > 0 ||
            bucket.asset_reallocation_between_purpose_buckets_to.length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader
                count={
                  bucket.asset_reallocation_between_purpose_buckets_from.length + bucket.asset_reallocation_between_purpose_buckets_to.length
                }
              >
                Asset Reallocations
              </SectionHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* From This Bucket */}
                {bucket.asset_reallocation_between_purpose_buckets_from.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>From This Bucket</span>
                      <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                        {bucket.asset_reallocation_between_purpose_buckets_from.length}
                      </span>
                    </h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {bucket.asset_reallocation_between_purpose_buckets_from.map(realloc => (
                        <div key={realloc.id} className="p-4 border border-amber-200 bg-amber-50/30 rounded-lg hover:bg-amber-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                To
                                <Link
                                  href={`/purpose_buckets/${realloc.to_purpose_bucket.id}`}
                                  className="font-medium text-blue-600 hover:text-blue-700"
                                >
                                  {realloc.to_purpose_bucket.name}
                                </Link>
                              </div>
                              {realloc.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${realloc.asset.id}`} className="text-blue-600 hover:underline">
                                    {realloc.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(realloc.date)}</div>
                            </div>
                            <div className="text-lg font-bold text-red-600">-{realloc.quantity}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* To This Bucket */}
                {bucket.asset_reallocation_between_purpose_buckets_to.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <span>To This Bucket</span>
                      <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                        {bucket.asset_reallocation_between_purpose_buckets_to.length}
                      </span>
                    </h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                      {bucket.asset_reallocation_between_purpose_buckets_to.map(realloc => (
                        <div key={realloc.id} className="p-4 border border-amber-200 bg-amber-50/30 rounded-lg hover:bg-amber-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                From
                                <Link
                                  href={`/purpose_buckets/${realloc.from_purpose_bucket.id}`}
                                  className="font-medium text-blue-600 hover:text-blue-700"
                                >
                                  {realloc.from_purpose_bucket.name}
                                </Link>
                              </div>
                              {realloc.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${realloc.asset.id}`} className="text-blue-600 hover:underline">
                                    {realloc.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(realloc.date)}</div>
                            </div>
                            <div className="text-lg font-bold text-green-600">+{realloc.quantity}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Asset Replacements */}
          {bucket.asset_replacement_in_purpose_buckets.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader count={bucket.asset_replacement_in_purpose_buckets.length}>Asset Replacements</SectionHeader>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {bucket.asset_replacement_in_purpose_buckets.map(replacement => (
                  <div key={replacement.id} className="p-5 border border-indigo-200 bg-indigo-50/30 rounded-xl hover:bg-indigo-50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Debit Asset</div>
                            {replacement.asset_trade_txn?.debit_asset && (
                              <Link
                                href={`/assets/${replacement.asset_trade_txn.debit_asset.id}`}
                                className="font-medium text-blue-600 hover:text-blue-700"
                              >
                                {replacement.asset_trade_txn.debit_asset.name}
                              </Link>
                            )}
                            <div className="text-sm font-bold text-red-600 mt-1">-{replacement.debit_quantity}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Credit Asset</div>
                            {replacement.asset_trade_txn?.credit_asset && (
                              <Link
                                href={`/assets/${replacement.asset_trade_txn.credit_asset.id}`}
                                className="font-medium text-blue-600 hover:text-blue-700"
                              >
                                {replacement.asset_trade_txn.credit_asset.name}
                              </Link>
                            )}
                            <div className="text-sm font-bold text-green-600 mt-1">+{replacement.credit_quantity}</div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">{formatOnlyDate(replacement.asset_trade_txn?.transaction?.date)}</div>
                      </div>
                      {replacement.asset_trade_txn?.transaction_id && (
                        <Link
                          href={`/transactions/${replacement.asset_trade_txn.transaction_id}`}
                          className="text-xs text-blue-600 hover:underline ml-4"
                        >
                          View →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}