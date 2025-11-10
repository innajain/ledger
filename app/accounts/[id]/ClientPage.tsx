'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_account } from '@/server actions/account/delete';
import { get_indian_date_from_date_obj } from '@/utils/date';
import { format_indian_currency } from '@/utils/format_currency';
import { asset, Prisma } from '@/generated/prisma/wasm';
import { Decimal } from 'decimal.js';

type AccountView = Prisma.accountGetPayload<{
  include: {
    opening_balances: { include: { asset: true } };
    income_txn: { include: { asset: true; transaction: true } };
    expense_txn: { include: { asset: true; purpose_bucket: true; transaction: true } };
    self_transfer_or_refundable_or_refund_txn_from: { include: { asset: true; to_account: true; transaction: true } };
    self_transfer_or_refundable_or_refund_txn_to: { include: { asset: true; from_account: true; transaction: true } };
    asset_trade_debit: { include: { credit_asset: true; debit_asset: true; credit_account: true; transaction: true } };
    asset_trade_credit: { include: { debit_asset: true; credit_asset: true; debit_account: true; transaction: true } };
  };
}> & {
  total_monetary_value: number;
  assets_with_balance_price_value: (asset & { balance: number; price: number | null; monetary_value: number | null })[];
};

export function ClientPage({ account }: { account: AccountView }) {
  const acc = account;
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const currentAssets = acc.assets_with_balance_price_value.filter(a => new Decimal(a.balance).gt(0));

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
        <Link href="/accounts" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Accounts
        </Link>

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{acc.name}</h1>
                  <div className="text-sm text-gray-500 font-mono">ID: {acc.id}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-100">
                <div className="text-sm text-gray-600 mb-1">Total Portfolio Value</div>
                <div className="text-2xl font-bold text-gray-900">{format_indian_currency(acc.total_monetary_value)}</div>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/accounts/${acc.id}/edit`}
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

        {/* Current Assets */}
        {currentAssets.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <SectionHeader count={currentAssets.length}>Current Assets</SectionHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-2">
              {currentAssets.map(a => (
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
                    {a.price != null && (
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Value</div>
                        <div className="text-lg font-semibold text-emerald-600">
                          {format_indian_currency(Math.round((a.balance || 0) * a.price * 100) / 100)}
                        </div>
                      </div>
                    )}
                  </div>
                  {a.price != null && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500">Price: {format_indian_currency(a.price)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Sections */}
        <div className="space-y-6">
          {/* Opening Balances */}
          {acc.opening_balances.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader count={acc.opening_balances.length}>Opening Balances</SectionHeader>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {acc.opening_balances.map(ob => (
                  <div key={ob.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <Link href={`/assets/${ob.asset.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                          {ob.asset.name}
                        </Link>
                        <div className="text-xs text-gray-500 mt-1">{formatOnlyDate(ob.date)}</div>
                      </div>
                      <div className="text-lg font-bold text-gray-900">{ob.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Income and Expense Transactions - Side by Side */}
          {(acc.income_txn.length > 0 || acc.expense_txn.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Expense Transactions */}
              {acc.expense_txn.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={acc.expense_txn.length}>Expense Transactions</SectionHeader>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.expense_txn.map(t => (
                      <div key={t.id} className="p-4 border border-red-200 bg-red-50/30 rounded-lg hover:bg-red-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            {t.asset ? (
                              <Link href={`/assets/${t.asset.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                {t.asset.name}
                              </Link>
                            ) : (
                              <div className="font-medium text-gray-900">Expense</div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">{formatOnlyDate(t.transaction.date)}</div>
                            {t.purpose_bucket && (
                              <div className="text-xs text-gray-600 mt-1">
                                Bucket:{' '}
                                <Link href={`/purpose_buckets/${t.purpose_bucket.id}`} className="text-blue-600 hover:underline">
                                  {t.purpose_bucket.name}
                                </Link>
                              </div>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-red-600">-{t.quantity}</div>
                            <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                              View →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Income Transactions */}
              {acc.income_txn.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={acc.income_txn.length}>Income Transactions</SectionHeader>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.income_txn.map(t => (
                      <div key={t.id} className="p-4 border border-green-200 bg-green-50/30 rounded-lg hover:bg-green-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            {t.asset ? (
                              <Link href={`/assets/${t.asset.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                {t.asset.name}
                              </Link>
                            ) : (
                              <div className="font-medium text-gray-900">Income</div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">{formatOnlyDate(t.transaction.date)}</div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-green-600">+{t.quantity}</div>
                            <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                              View →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Self Transfers */}
          {(acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'self_transfer').length > 0 ||
            acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'self_transfer').length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader
                count={
                  acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'self_transfer').length +
                  acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'self_transfer').length
                }
              >
                Self Transfers
              </SectionHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* From This Account */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>From This Account</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                      {acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'self_transfer').length}
                    </span>
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.self_transfer_or_refundable_or_refund_txn_from
                      .filter(t => t.transaction?.type === 'self_transfer')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-purple-200 bg-purple-50/30 rounded-lg hover:bg-purple-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                From
                                {t.to_account ? (
                                  <Link href={`/accounts/${t.to_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                    {t.to_account.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-900">{t.to_account_id}</span>
                                )}
                              </div>
                              {t.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">
                                    {t.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-red-600">-{t.quantity}</div>
                              <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* To This Account */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>To This Account</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                      {acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'self_transfer').length}
                    </span>
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.self_transfer_or_refundable_or_refund_txn_to
                      .filter(t => t.transaction?.type === 'self_transfer')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-purple-200 bg-purple-50/30 rounded-lg hover:bg-purple-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                To
                                {t.from_account ? (
                                  <Link href={`/accounts/${t.from_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                    {t.from_account.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-900">{t.from_account_id}</span>
                                )}
                              </div>
                              {t.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">
                                    {t.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-green-600">+{t.quantity}</div>
                              <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Refundable Transactions */}
          {(acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'refundable').length > 0 ||
            acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'refundable').length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader
                count={
                  acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'refundable').length +
                  acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'refundable').length
                }
              >
                Refundable Transactions
              </SectionHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* From This Account */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>From This Account</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                      {acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'refundable').length}
                    </span>
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.self_transfer_or_refundable_or_refund_txn_from
                      .filter(t => t.transaction?.type === 'refundable')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-orange-200 bg-orange-50/30 rounded-lg hover:bg-orange-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                From
                                {t.to_account ? (
                                  <Link href={`/accounts/${t.to_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                    {t.to_account.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-900">{t.to_account_id}</span>
                                )}
                              </div>
                              {t.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">
                                    {t.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-red-600">-{t.quantity}</div>
                              <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* To This Account */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>To This Account</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
                      {acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'refundable').length}
                    </span>
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.self_transfer_or_refundable_or_refund_txn_to
                      .filter(t => t.transaction?.type === 'refundable')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-orange-200 bg-orange-50/30 rounded-lg hover:bg-orange-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                To
                                {t.from_account ? (
                                  <Link href={`/accounts/${t.from_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                    {t.from_account.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-900">{t.from_account_id}</span>
                                )}
                              </div>
                              {t.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">
                                    {t.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-green-600">+{t.quantity}</div>
                              <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Refund Transactions */}
          {(acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'refund').length > 0 ||
            acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'refund').length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader
                count={
                  acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'refund').length +
                  acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'refund').length
                }
              >
                Refund Transactions
              </SectionHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* From This Account */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>From This Account</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                      {acc.self_transfer_or_refundable_or_refund_txn_from.filter(t => t.transaction?.type === 'refund').length}
                    </span>
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.self_transfer_or_refundable_or_refund_txn_from
                      .filter(t => t.transaction?.type === 'refund')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-teal-200 bg-teal-50/30 rounded-lg hover:bg-teal-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                From
                                {t.to_account ? (
                                  <Link href={`/accounts/${t.to_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                    {t.to_account.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-900">{t.to_account_id}</span>
                                )}
                              </div>
                              {t.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">
                                    {t.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-red-600">-{t.quantity}</div>
                              <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* To This Account */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <span>To This Account</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                      {acc.self_transfer_or_refundable_or_refund_txn_to.filter(t => t.transaction?.type === 'refund').length}
                    </span>
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {acc.self_transfer_or_refundable_or_refund_txn_to
                      .filter(t => t.transaction?.type === 'refund')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-teal-200 bg-teal-50/30 rounded-lg hover:bg-teal-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                To
                                {t.from_account ? (
                                  <Link href={`/accounts/${t.from_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                    {t.from_account.name}
                                  </Link>
                                ) : (
                                  <span className="text-gray-900">{t.from_account_id}</span>
                                )}
                              </div>
                              {t.asset && (
                                <div className="text-xs text-gray-600 mb-1">
                                  <Link href={`/assets/${t.asset.id}`} className="text-blue-600 hover:underline">
                                    {t.asset.name}
                                  </Link>
                                </div>
                              )}
                              <div className="text-xs text-gray-500">{formatOnlyDate(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-green-600">+{t.quantity}</div>
                              <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Asset Trades - Side by Side */}
          {(acc.asset_trade_debit.length > 0 || acc.asset_trade_credit.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Debit Trades */}
              {acc.asset_trade_debit.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={acc.asset_trade_debit.length}>Asset Trades (Debit)</SectionHeader>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {acc.asset_trade_debit.map((t: any) => (
                      <div key={t.id} className="p-5 border border-red-200 bg-red-50/30 rounded-xl hover:bg-red-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            {t.debit_asset && (
                              <div className="mb-2">
                                <span className="text-xs text-gray-500">Debit Asset:</span>
                                <Link href={`/assets/${t.debit_asset.id}`} className="block font-medium text-blue-600 hover:text-blue-700">
                                  {t.debit_asset.name}
                                </Link>
                              </div>
                            )}
                            {t.credit_asset && (
                              <div className="text-xs text-gray-600 mb-1">
                                Credit:{' '}
                                <Link href={`/assets/${t.credit_asset.id}`} className="text-blue-600 hover:underline">
                                  {t.credit_asset.name}
                                </Link>
                              </div>
                            )}
                            <div className="text-xs text-gray-500">{formatOnlyDate(t.debit_date)}</div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-red-600">-{t.debit_quantity}</div>
                            <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                              View →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Credit Trades */}
              {acc.asset_trade_credit.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={acc.asset_trade_credit.length}>Asset Trades (Credit)</SectionHeader>
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {acc.asset_trade_credit.map((t: any) => (
                      <div key={t.id} className="p-5 border border-green-200 bg-green-50/30 rounded-xl hover:bg-green-50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            {t.credit_asset && (
                              <div className="mb-2">
                                <span className="text-xs text-gray-500">Credit Asset:</span>
                                <Link href={`/assets/${t.credit_asset.id}`} className="block font-medium text-blue-600 hover:text-blue-700">
                                  {t.credit_asset.name}
                                </Link>
                              </div>
                            )}
                            {t.debit_asset && (
                              <div className="text-xs text-gray-600 mb-1">
                                Debit:{' '}
                                <Link href={`/assets/${t.debit_asset.id}`} className="text-blue-600 hover:underline">
                                  {t.debit_asset.name}
                                </Link>
                              </div>
                            )}
                            <div className="text-xs text-gray-500">{formatOnlyDate(t.credit_date)}</div>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-green-600">+{t.credit_quantity}</div>
                            <Link href={`/transactions/${t.transaction_id}`} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                              View →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
