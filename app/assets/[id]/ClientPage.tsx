'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_asset } from '@/server actions/asset/delete';
import { format_indian_currency } from '@/utils/format_currency';
import { Prisma } from '@/generated/prisma';
import { Decimal } from 'decimal.js';
import { get_indian_date_from_date_obj } from '@/utils/date';

type AssetView = Prisma.assetGetPayload<{
  include: {
    opening_balances: { include: { account: true } };
    income_txn: { include: { account: true; transaction: true } };
    expense_txn: { include: { account: true; purpose_bucket: true; transaction: true } };
    asset_trade_credit: { include: { credit_account: true; transaction: true; debit_account: true; debit_asset: true } };
    asset_trade_debit: { include: { debit_account: true; transaction: true; credit_account: true; credit_asset: true } };
    self_transfer_or_refundable_or_refund_txn: { include: { from_account: true; to_account: true; transaction: true } };
  };
}>;

export function ClientPage({
  asset,
  price_data,
  balance,
  account_entries,
}: {
  asset: AssetView;
  price_data: {
    price: number;
    date: Date;
  } | null;
  balance: number | null;
  account_entries: { id: string; name: string; balance: number }[];
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const filtered_account_entries = account_entries.filter(acc => new Decimal(acc.balance).gt(0));

  async function handle_delete() {
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

  const total_value = account_entries.reduce((sum, acc) => {
    if (!price_data) return sum;
    return sum + new Decimal(acc.balance).times(price_data.price).toNumber();
  }, 0);

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
        <Link href="/assets" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Assets
        </Link>

        {/* Header Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{asset.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">{asset.type}</span>
                    {asset.code && <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full font-mono">{asset.code}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                <div className="text-sm text-gray-600 mb-1">Current Price</div>
                <div className="text-2xl font-bold text-gray-900">{price_data ? format_indian_currency(price_data.price) : '—'}</div>
                {price_data && <div className="text-xs text-gray-500 mt-1">as of {get_indian_date_from_date_obj(price_data.date)}</div>}
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/assets/${asset.id}/edit`}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-center"
                >
                  Edit
                </Link>
                <button
                  onClick={handle_delete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Current Balances */}
        {filtered_account_entries.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <SectionHeader count={filtered_account_entries.length}>Current Holdings</SectionHeader>

            {price_data && total_value > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-600">Total Portfolio Value</div>
                    <div className="text-3xl font-bold text-gray-900 mt-1">{format_indian_currency(total_value)}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-500">Balance</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {balance !== null && balance !== undefined ? format_indian_currency(balance) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto pr-2">
              {filtered_account_entries.map(account => (
                <div
                  key={account.id}
                  className="group p-5 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <Link href={`/accounts/${account.id}`} className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {account.name}
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
                      <div className="text-2xl font-bold text-gray-900">{account.balance}</div>
                    </div>
                    {price_data && (
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Value</div>
                        <div className="text-lg font-semibold text-emerald-600">
                          {format_indian_currency(new Decimal(account.balance).times(price_data.price).toNumber())}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction Sections */}
        <div className="space-y-6">
          {/* Opening Balances */}
          {asset.opening_balances.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader count={asset.opening_balances.length}>Opening Balances</SectionHeader>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {asset.opening_balances.map(ob => (
                  <div key={ob.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <Link href={`/accounts/${ob.account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                          {ob.account.name}
                        </Link>
                        <div className="text-xs text-gray-500 mt-1">{get_indian_date_from_date_obj(ob.date)}</div>
                      </div>
                      <div className="text-lg font-bold text-gray-900">{ob.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Income and Expense Transactions - Side by Side on Desktop */}
          {(asset.income_txn.length > 0 || asset.expense_txn.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Expense Transactions */}
              {asset.expense_txn.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={asset.expense_txn.length}>Expense Transactions</SectionHeader>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {asset.expense_txn.map(t => (
                      <div key={t.id} className="p-4 border border-red-200 bg-red-50/30 rounded-lg hover:bg-red-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <Link href={`/accounts/${t.account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                              {t.account.name}
                            </Link>
                            <div className="text-xs text-gray-500 mt-1">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                            <div className="text-xs text-gray-600 mt-1">
                              Bucket:{' '}
                              <Link href={`/purpose_buckets/${t.purpose_bucket.id}`} className="text-blue-600 hover:underline">
                                {t.purpose_bucket.name}
                              </Link>
                            </div>
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
              {asset.income_txn.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={asset.income_txn.length}>Income Transactions</SectionHeader>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {asset.income_txn.map(t => (
                      <div key={t.id} className="p-4 border border-green-200 bg-green-50/30 rounded-lg hover:bg-green-50 transition-colors">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <Link href={`/accounts/${t.account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                              {t.account.name}
                            </Link>
                            <div className="text-xs text-gray-500 mt-1">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                            {t.transaction.description && <div className="text-xs text-gray-600 mt-2">{t.transaction.description}</div>}
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
          {asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'self_transfer').length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <SectionHeader count={asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'self_transfer').length}>
                Self Transfers
              </SectionHeader>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {asset.self_transfer_or_refundable_or_refund_txn
                  .filter(t => t.transaction.type === 'self_transfer')
                  .map(t => (
                    <div key={t.id} className="p-4 border border-purple-200 bg-purple-50/30 rounded-lg hover:bg-purple-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm mb-2">
                            <Link href={`/accounts/${t.from_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                              {t.from_account.name}
                            </Link>
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            <Link href={`/accounts/${t.to_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                              {t.to_account.name}
                            </Link>
                          </div>
                          <div className="text-xs text-gray-500">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-lg font-bold text-gray-900">{t.quantity}</div>
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

          {/* Refundable and Refund Transactions - Side by Side on Desktop */}
          {(asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'refundable').length > 0 ||
            asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'refund').length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Refundable Transactions */}
              {asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'refundable').length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'refundable').length}>
                    Refundable Transactions
                  </SectionHeader>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {asset.self_transfer_or_refundable_or_refund_txn
                      .filter(t => t.transaction.type === 'refundable')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-orange-200 bg-orange-50/30 rounded-lg hover:bg-orange-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                <Link href={`/accounts/${t.from_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                  {t.from_account.name}
                                </Link>
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                                <Link href={`/accounts/${t.to_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                  {t.to_account.name}
                                </Link>
                              </div>
                              <div className="text-xs text-gray-500">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-gray-900">{t.quantity}</div>
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

              {/* Refund Transactions */}
              {asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'refund').length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                  <SectionHeader count={asset.self_transfer_or_refundable_or_refund_txn.filter(t => t.transaction.type === 'refund').length}>
                    Refund Transactions
                  </SectionHeader>
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {asset.self_transfer_or_refundable_or_refund_txn
                      .filter(t => t.transaction.type === 'refund')
                      .map(t => (
                        <div key={t.id} className="p-4 border border-teal-200 bg-teal-50/30 rounded-lg hover:bg-teal-50 transition-colors">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 text-sm mb-2">
                                <Link href={`/accounts/${t.from_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                  {t.from_account.name}
                                </Link>
                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                                <Link href={`/accounts/${t.to_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                                  {t.to_account.name}
                                </Link>
                              </div>
                              <div className="text-xs text-gray-500">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                            </div>
                            <div className="text-right ml-4">
                              <div className="text-lg font-bold text-gray-900">{t.quantity}</div>
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

        {/* Asset Trades - Side by Side on Desktop */}
        {(asset.asset_trade_debit.length > 0 || asset.asset_trade_credit.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Asset Trades - Debit (Selling this asset) */}
            {asset.asset_trade_debit.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <SectionHeader count={asset.asset_trade_debit.length}>Asset Trades (Debit - Selling)</SectionHeader>
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {asset.asset_trade_debit.map(t => (
                    <div
                      key={t.id || t.transaction_id}
                      className="p-5 border border-red-200 bg-red-50/30 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <Link href={`/accounts/${t.debit_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                            {t.debit_account.name}
                          </Link>
                          <div className="text-xs text-gray-500 mt-1">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Credited {t.credit_quantity}{' '}
                            <Link href={`/assets/${t.credit_asset_id}`} className="text-blue-600 hover:underline">
                              {t.credit_asset.name}
                            </Link>{' '}
                            in{' '}
                            <Link href={`/accounts/${t.credit_account_id}`} className="text-blue-600 hover:underline">
                              {t.credit_account.name}
                            </Link>
                          </div>
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

            {/* Asset Trades - Credit (Buying this asset) */}
            {asset.asset_trade_credit.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <SectionHeader count={asset.asset_trade_credit.length}>Asset Trades (Credit - Buying)</SectionHeader>
                <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                  {asset.asset_trade_credit.map(t => (
                    <div
                      key={t.id || t.transaction_id}
                      className="p-5 border border-green-200 bg-green-50/30 rounded-xl hover:bg-green-50 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <Link href={`/accounts/${t.credit_account.id}`} className="font-medium text-blue-600 hover:text-blue-700">
                            {t.credit_account.name}
                          </Link>
                          <div className="text-xs text-gray-500 mt-1">{get_indian_date_from_date_obj(t.transaction.date)}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Debited {t.credit_quantity}{' '}
                            <Link href={`/assets/${t.debit_asset_id}`} className="text-blue-600 hover:underline">
                              {t.debit_asset.name}
                            </Link>{' '}
                            from{' '}
                            <Link href={`/accounts/${t.debit_account_id}`} className="text-blue-600 hover:underline">
                              {t.debit_account.name}
                            </Link>
                          </div>
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
  );
}
