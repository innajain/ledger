'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { delete_transaction } from '@/server actions/transaction/delete';
import { format_indian_currency } from '@/utils/format_currency';
import { get_indian_date_from_date_obj } from '@/utils/date';
import { asset_type, Prisma } from '@/generated/prisma';

export default function ClientPage({
  initial_data,
}: {
  initial_data: Prisma.transactionGetPayload<{
    include: {
      income_txn: { include: { allocation_to_purpose_buckets: { include: { bucket: true } }; account: true; asset: true } };
      expense_txn: { include: { account: true; purpose_bucket: true; asset: true } };
      self_transfer_or_refundable_or_refund_txn: { include: { from_account: true; to_account: true; asset: true } };
      asset_trade_txn: {
        include: {
          asset_replacement_in_purpose_buckets: { include: { purpose_bucket: true } };
          debit_account: true;
          credit_account: true;
          debit_asset: true;
          credit_asset: true;
        };
      };
    };
  }>;
}) {
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

  // Determine transaction type
  let txnType = '';
  let txnIcon = '';
  let borderColor = '';

  if (txn.income_txn) {
    txnType = 'Income';
    txnIcon = '💰';
    borderColor = 'border-green-500';
  } else if (txn.expense_txn) {
    txnType = 'Expense';
    txnIcon = '💸';
    borderColor = 'border-red-500';
  } else if (txn.self_transfer_or_refundable_or_refund_txn) {
    if (txn.type === 'refundable') {
      txnType = 'Refundable';
      txnIcon = '🔖';
    } else if (txn.type === 'refund') {
      txnType = 'Refund';
      txnIcon = '↩️';
    } else {
      txnType = 'Self Transfer';
      txnIcon = '🔄';
    }
    borderColor = 'border-blue-500';
  } else if (txn.asset_trade_txn) {
    txnType = 'Asset Trade';
    txnIcon = '🔀';
    borderColor = 'border-purple-500';
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Navigation */}
        <div className="mb-4">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            <span>←</span> Back to Transactions
          </Link>
        </div>

        {/* Single Unified Card */}
        <div className={`bg-white rounded-2xl shadow-lg p-4 md:p-6 border-l-4 ${borderColor}`}>
          {/* Header Section */}
          <div className="flex flex-col gap-4 pb-6 mb-6 border-b-2 border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl flex-shrink-0">{txnIcon}</span>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-gray-900">{txnType}</h1>
                  <div className="text-sm text-gray-500 mt-1">{fmtDate(txn.date)}</div>
                  <p className="text-gray-700 mt-2 text-sm">{txn.description || <span className="italic text-gray-400">No description</span>}</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
                <Link
                  href={`/transactions/${txn.id}/edit`}
                  className="px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all whitespace-nowrap"
                >
                  ✏️ Edit
                </Link>
                <button
                  onClick={onDelete}
                  disabled={deleting}
                  className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
                >
                  {deleting ? 'Deleting...' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          </div>

          {/* Transaction Details */}
          {txn.income_txn && (
            <div>
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Asset</div>
                  <div className="font-semibold text-gray-900">
                    {txn.income_txn.asset ? (
                      <Link href={`/assets/${txn.income_txn.asset.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {txn.income_txn.asset.name}
                      </Link>
                    ) : (
                      txn.income_txn.asset_id
                    )}
                    {txn.income_txn.asset?.type && <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">{txn.income_txn.asset.type}</span>}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Account</div>
                  <div className="font-semibold text-gray-900">
                    {txn.income_txn.account ? (
                      <Link href={`/accounts/${txn.income_txn.account.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {txn.income_txn.account.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Not specified</span>
                    )}
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200 md:col-span-2">
                  <div className="text-xs text-green-700 mb-1 font-semibold uppercase tracking-wide">Quantity Received</div>
                  <div className="font-bold text-2xl text-green-700">{txn.income_txn.quantity}</div>
                </div>
              </div>

              {txn.income_txn.allocation_to_purpose_buckets && txn.income_txn.allocation_to_purpose_buckets.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Purpose Bucket Allocations</h3>
                  <div className="space-y-2">
                    {txn.income_txn.allocation_to_purpose_buckets.map(a => (
                      <div
                        key={a.id ?? `${a.purpose_bucket_id}-${a.quantity}`}
                        className="flex justify-between items-center bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-medium flex items-center gap-2">
                          <span className="text-lg">🎯</span>
                          {a.bucket ? (
                            <Link href={`/purpose_buckets/${a.bucket.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                              {a.bucket.name}
                            </Link>
                          ) : (
                            a.purpose_bucket_id
                          )}
                        </div>
                        <div className="font-semibold text-gray-900 text-right">{a.quantity}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-gray-500 italic">
                    Total allocated: {txn.income_txn.allocation_to_purpose_buckets.reduce((sum, a) => sum + (a.quantity || 0), 0)}
                  </div>
                </div>
              )}
            </div>
          )}

          {txn.expense_txn && (
            <div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Asset</div>
                  <div className="font-semibold text-gray-900">
                    {txn.expense_txn.asset ? (
                      <Link href={`/assets/${txn.expense_txn.asset.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {txn.expense_txn.asset.name}
                      </Link>
                    ) : (
                      txn.expense_txn.asset_id
                    )}
                    {txn.expense_txn.asset?.type && (
                      <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">{txn.expense_txn.asset.type}</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Account</div>
                  <div className="font-semibold text-gray-900">
                    {txn.expense_txn.account ? (
                      <Link href={`/accounts/${txn.expense_txn.account.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">
                        {txn.expense_txn.account.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Not specified</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Purpose Bucket</div>
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    {txn.expense_txn.purpose_bucket ? (
                      <Link
                        href={`/purpose_buckets/${txn.expense_txn.purpose_bucket.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {txn.expense_txn.purpose_bucket.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Not specified</span>
                    )}
                  </div>
                </div>

                <div className="bg-red-50 rounded-lg p-4 border-2 border-red-200 md:col-span-2">
                  <div className="text-xs text-red-700 mb-1 font-semibold uppercase tracking-wide">Amount Spent</div>
                  <div className="font-bold text-2xl text-red-700">{txn.expense_txn.quantity}</div>
                </div>
              </div>
            </div>
          )}

          {txn.self_transfer_or_refundable_or_refund_txn && (
            <div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 md:col-span-2">
                  <div className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Asset</div>
                  <div className="font-semibold text-gray-900">
                    {txn.self_transfer_or_refundable_or_refund_txn.asset ? (
                      <Link
                        href={`/assets/${txn.self_transfer_or_refundable_or_refund_txn.asset.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {txn.self_transfer_or_refundable_or_refund_txn.asset.name}
                      </Link>
                    ) : (
                      txn.self_transfer_or_refundable_or_refund_txn.asset_id
                    )}
                    {txn.self_transfer_or_refundable_or_refund_txn.asset?.type && (
                      <span className="ml-2 text-xs bg-gray-200 px-2 py-0.5 rounded">{txn.self_transfer_or_refundable_or_refund_txn.asset.type}</span>
                    )}
                  </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="text-xs text-orange-700 mb-1 font-semibold uppercase tracking-wide">From Account</div>
                  <div className="font-semibold text-gray-900">
                    {txn.self_transfer_or_refundable_or_refund_txn.from_account ? (
                      <Link
                        href={`/accounts/${txn.self_transfer_or_refundable_or_refund_txn.from_account.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {txn.self_transfer_or_refundable_or_refund_txn.from_account.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Not specified</span>
                    )}
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="text-xs text-green-700 mb-1 font-semibold uppercase tracking-wide">To Account</div>
                  <div className="font-semibold text-gray-900">
                    {txn.self_transfer_or_refundable_or_refund_txn.to_account ? (
                      <Link
                        href={`/accounts/${txn.self_transfer_or_refundable_or_refund_txn.to_account.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {txn.self_transfer_or_refundable_or_refund_txn.to_account.name}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Not specified</span>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 md:col-span-2 border-2 border-blue-200">
                  <div className="text-xs text-blue-700 mb-1 font-semibold uppercase tracking-wide">Transfer Quantity</div>
                  <div className="font-bold text-2xl text-blue-700">{txn.self_transfer_or_refundable_or_refund_txn.quantity}</div>
                </div>
              </div>
            </div>
          )}

          {txn.asset_trade_txn && (
            <div>
              <div className="bg-gradient-to-r from-red-50 to-green-50 rounded-lg p-4 mb-6 border-2 border-gray-200">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-red-700 mb-2 font-semibold uppercase tracking-wide">Sold (Debit)</div>
                    <div className="font-bold text-xl text-red-700 mb-1">{txn.asset_trade_txn.debit_quantity}</div>
                    <div className="text-sm">
                      {txn.asset_trade_txn.debit_asset ? (
                        <Link
                          href={`/assets/${txn.asset_trade_txn.debit_asset.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {txn.asset_trade_txn.debit_asset.name}
                        </Link>
                      ) : (
                        txn.asset_trade_txn.debit_asset_id
                      )}
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      <span className="font-medium">Account:</span>{' '}
                      {txn.asset_trade_txn.debit_account ? (
                        <Link href={`/accounts/${txn.asset_trade_txn.debit_account.id}`} className="text-blue-600 hover:underline">
                          {txn.asset_trade_txn.debit_account.name}
                        </Link>
                      ) : (
                        'Not specified'
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-green-700 mb-2 font-semibold uppercase tracking-wide">Bought (Credit)</div>
                    <div className="font-bold text-xl text-green-700 mb-1">{txn.asset_trade_txn.credit_quantity}</div>
                    <div className="text-sm">
                      {txn.asset_trade_txn.credit_asset ? (
                        <Link
                          href={`/assets/${txn.asset_trade_txn.credit_asset.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {txn.asset_trade_txn.credit_asset.name}
                        </Link>
                      ) : (
                        txn.asset_trade_txn.credit_asset_id
                      )}
                    </div>
                    <div className="text-xs text-gray-600 mt-2">
                      <span className="font-medium">Account:</span>{' '}
                      {txn.asset_trade_txn.credit_account ? (
                        <Link href={`/accounts/${txn.asset_trade_txn.credit_account.id}`} className="text-blue-600 hover:underline">
                          {txn.asset_trade_txn.credit_account.name}
                        </Link>
                      ) : (
                        'Not specified'
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {txn.asset_trade_txn.asset_replacement_in_purpose_buckets && txn.asset_trade_txn.asset_replacement_in_purpose_buckets.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Purpose Bucket Replacements</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-3 px-2 font-semibold text-gray-700">Purpose Bucket</th>
                          <th className="text-right py-3 px-2 font-semibold text-red-700">Debit</th>
                          <th className="text-right py-3 px-2 font-semibold text-green-700">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txn.asset_trade_txn.asset_replacement_in_purpose_buckets.map((r: any) => (
                          <tr
                            key={r.id ?? `${r.purpose_bucket_id}-${r.debit_quantity}`}
                            className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                          >
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <span className="text-base">🎯</span>
                                {r.purpose_bucket ? (
                                  <Link
                                    href={`/purpose_buckets/${r.purpose_bucket.id}`}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                  >
                                    {r.purpose_bucket.name}
                                  </Link>
                                ) : (
                                  r.purpose_bucket_id
                                )}
                              </div>
                            </td>
                            <td className="text-right py-3 px-2 font-semibold text-red-700">{r.debit_quantity}</td>
                            <td className="text-right py-3 px-2 font-semibold text-green-700">{r.credit_quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
