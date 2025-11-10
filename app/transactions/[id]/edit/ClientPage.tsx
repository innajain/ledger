'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  update_income_transaction,
  update_expense_transaction,
  update_self_transfer_or_refundable_or_refund_transaction,
  update_asset_trade_transaction,
} from '@/server actions/transaction/update';
import { get_indian_date_from_date_obj } from '@/utils/date';
import { account, asset, Prisma, purpose_bucket } from '@/generated/prisma';

export default function ClientPage({
  initial_data,
  initial_buckets,
  initial_assets,
  initial_accounts,
}: {
  initial_data: Prisma.transactionGetPayload<{
    include: {
      income_txn: { include: { allocation_to_purpose_buckets: true } };
      expense_txn: true;
      self_transfer_or_refundable_or_refund_txn: true;
      asset_trade_txn: { include: { asset_replacement_in_purpose_buckets: true } };
    };
  }>;
  initial_buckets: purpose_bucket[];
  initial_assets: asset[];
  initial_accounts: account[];
}) {
  const txn = initial_data;
  const router = useRouter();
  const [description, setDescription] = useState(txn.description || '');
  const [dateStr, setDateStr] = useState(() => {
    const d = txn.date;
    if (!d) return '';
    const dt = new Date(String(d));
    const date = get_indian_date_from_date_obj(dt);
    return date;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  type Bucket = { id: string; name: string };
  type Allocation = { id?: string; purpose_bucket_id: string; quantity: number; markedForDelete?: boolean };
  type AssetReplacement = { id?: string; purpose_bucket_id: string; debit_quantity: number; credit_quantity: number; markedForDelete?: boolean };

  const initialIncomeAllocs: Allocation[] = (txn.income_txn?.allocation_to_purpose_buckets || []).map((a: any) => ({
    id: a.id,
    purpose_bucket_id: a.purpose_bucket_id,
    quantity: a.quantity,
  }));
  const [incomeAllocs, setIncomeAllocs] = useState<Allocation[]>(initialIncomeAllocs);

  const initialAssetReplacements: AssetReplacement[] = (txn.asset_trade_txn?.asset_replacement_in_purpose_buckets || []).map((a: any) => ({
    id: a.id,
    purpose_bucket_id: a.purpose_bucket_id,
    debit_quantity: a.debit_quantity,
    credit_quantity: a.credit_quantity,
  }));
  const [assetReplacements, setAssetReplacements] = useState<AssetReplacement[]>(initialAssetReplacements);

  type Asset = { id: string; name: string };
  type Account = { id: string; name: string };

  const [incomeAssetId, setIncomeAssetId] = useState<string | undefined>(txn.income_txn?.asset_id ?? initial_assets[0]?.id);
  const [incomeAccountId, setIncomeAccountId] = useState<string | undefined>(txn.income_txn?.account_id ?? initial_accounts[0]?.id);
  const [incomeQuantity, setIncomeQuantity] = useState<number>(txn.income_txn?.quantity ?? 0);

  const [expenseAssetId, setExpenseAssetId] = useState<string | undefined>(txn.expense_txn?.asset_id ?? initial_assets[0]?.id);
  const [expenseAccountId, setExpenseAccountId] = useState<string | undefined>(txn.expense_txn?.account_id ?? initial_accounts[0]?.id);
  const [expenseQuantity, setExpenseQuantity] = useState<number>(txn.expense_txn?.quantity ?? 0);
  const [expensePurposeBucketId, setExpensePurposeBucketId] = useState<string | undefined>(
    txn.expense_txn?.purpose_bucket_id ?? initial_buckets[0]?.id
  );

  const [stType, setStType] = useState<string | undefined>(txn.type ?? undefined);
  const [stAssetId, setStAssetId] = useState<string | undefined>(txn.self_transfer_or_refundable_or_refund_txn?.asset_id ?? initial_assets[0]?.id);
  const [stFromAccountId, setStFromAccountId] = useState<string | undefined>(
    txn.self_transfer_or_refundable_or_refund_txn?.from_account_id ?? initial_accounts[0]?.id
  );
  const [stToAccountId, setStToAccountId] = useState<string | undefined>(
    txn.self_transfer_or_refundable_or_refund_txn?.to_account_id ?? initial_accounts[0]?.id
  );
  const [stQuantity, setStQuantity] = useState<number>(txn.self_transfer_or_refundable_or_refund_txn?.quantity ?? 0);

  const [debitAssetId, setDebitAssetId] = useState<string | undefined>(txn.asset_trade_txn?.debit_asset_id ?? initial_assets[0]?.id);
  const [debitAccountId, setDebitAccountId] = useState<string | undefined>(txn.asset_trade_txn?.debit_account_id ?? initial_accounts[0]?.id);
  const [debitQuantity, setDebitQuantity] = useState<number>(txn.asset_trade_txn?.debit_quantity ?? 0);
  const [creditAssetId, setCreditAssetId] = useState<string | undefined>(txn.asset_trade_txn?.credit_asset_id ?? initial_assets[0]?.id);
  const [creditAccountId, setCreditAccountId] = useState<string | undefined>(txn.asset_trade_txn?.credit_account_id ?? initial_accounts[0]?.id);
  const [creditQuantity, setCreditQuantity] = useState<number>(txn.asset_trade_txn?.credit_quantity ?? 0);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const datePayload = dateStr ? dateStr : undefined;

      if (txn.income_txn) {
        const creates = incomeAllocs
          .filter(a => !a.id && !a.markedForDelete)
          .map(a => ({ purpose_bucket_id: a.purpose_bucket_id, quantity: Number(a.quantity) }));
        const updates = incomeAllocs
          .filter(a => a.id && !a.markedForDelete)
          .map(a => ({ id: a.id!, purpose_bucket_id: a.purpose_bucket_id, quantity: Number(a.quantity) }));
        const deletes = incomeAllocs.filter(a => a.id && a.markedForDelete).map(a => ({ id: a.id! }));

        const incomeQty = Number(incomeQuantity ?? txn.income_txn.quantity ?? 0);
        const sum = incomeAllocs.filter(a => !a.markedForDelete).reduce((s, c) => s + Number(c.quantity || 0), 0);
        if (incomeQty !== sum) throw new Error('Sum of allocations must equal the income quantity');

        await update_income_transaction(txn.id, {
          description,
          date: datePayload,
          asset_id: incomeAssetId,
          account_id: incomeAccountId,
          quantity: incomeQty,
          allocation_to_purpose_buckets_creates: creates,
          allocation_to_purpose_buckets_deletes: deletes,
          allocation_to_purpose_buckets_updates: updates,
        });
      } else if (txn.expense_txn) {
        await update_expense_transaction(txn.id, {
          description,
          date: datePayload,
          asset_id: expenseAssetId,
          account_id: expenseAccountId,
          quantity: Number(expenseQuantity),
          purpose_bucket_id: expensePurposeBucketId,
        });
      } else if (txn.self_transfer_or_refundable_or_refund_txn) {
        await update_self_transfer_or_refundable_or_refund_transaction(txn.id, {
          type: stType as any,
          description,
          date: datePayload,
          asset_id: stAssetId,
          from_account_id: stFromAccountId,
          to_account_id: stToAccountId,
          quantity: Number(stQuantity),
        });
      } else if (txn.asset_trade_txn) {
        const creates = assetReplacements
          .filter(a => !a.id && !a.markedForDelete)
          .map(a => ({
            purpose_bucket_id: a.purpose_bucket_id,
            debit_quantity: Number(a.debit_quantity),
            credit_quantity: Number(a.credit_quantity),
          }));
        const updates = assetReplacements
          .filter(a => a.id && !a.markedForDelete)
          .map(a => ({
            id: a.id!,
            purpose_bucket_id: a.purpose_bucket_id,
            debit_quantity: Number(a.debit_quantity),
            credit_quantity: Number(a.credit_quantity),
          }));
        const deletes = assetReplacements.filter(a => a.id && a.markedForDelete).map(a => ({ id: a.id! }));

        const totalDebit = assetReplacements.filter(a => !a.markedForDelete).reduce((s, c) => s + Number(c.debit_quantity || 0), 0);
        const totalCredit = assetReplacements.filter(a => !a.markedForDelete).reduce((s, c) => s + Number(c.credit_quantity || 0), 0);
        if (Number(debitQuantity) !== totalDebit) throw new Error('Sum of debit in buckets must equal debit quantity');
        if (Number(creditQuantity) !== totalCredit) throw new Error('Sum of credit in buckets must equal credit quantity');

        await update_asset_trade_transaction(txn.id, {
          description,
          debit_asset_id: debitAssetId,
          debit_account_id: debitAccountId,
          debit_quantity: Number(debitQuantity),
          credit_asset_id: creditAssetId,
          credit_account_id: creditAccountId,
          credit_quantity: Number(creditQuantity),
          date: datePayload,
          asset_replacement_in_purpose_buckets_creates: creates,
          asset_replacement_in_purpose_buckets_deletes: deletes,
          asset_replacement_in_purpose_buckets_updates: updates,
        });
      }

      router.push(`/transactions/${txn.id}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  function updateIncomeAlloc(index: number, patch: Partial<Allocation>) {
    setIncomeAllocs(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addIncomeAlloc() {
    setIncomeAllocs(prev => [...prev, { purpose_bucket_id: initial_buckets[0]?.id || '', quantity: 0 }]);
  }

  function removeIncomeAlloc(index: number) {
    setIncomeAllocs(prev => {
      const a = prev[index];
      if (a.id) return prev.map((p, i) => (i === index ? { ...p, markedForDelete: true } : p));
      return prev.filter((_, i) => i !== index);
    });
  }

  function updateAssetReplacement(index: number, patch: Partial<AssetReplacement>) {
    setAssetReplacements(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addAssetReplacement() {
    setAssetReplacements(prev => [...prev, { purpose_bucket_id: initial_buckets[0]?.id || '', debit_quantity: 0, credit_quantity: 0 }]);
  }

  function removeAssetReplacement(index: number) {
    setAssetReplacements(prev => {
      const a = prev[index];
      if (a.id) return prev.map((p, i) => (i === index ? { ...p, markedForDelete: true } : p));
      return prev.filter((_, i) => i !== index);
    });
  }

  const getTxnTypeLabel = () => {
    if (txn.income_txn) return 'Income Transaction';
    if (txn.expense_txn) return 'Expense Transaction';
    if (txn.self_transfer_or_refundable_or_refund_txn) {
      if (stType === 'self_transfer') return 'Self Transfer';
      if (stType === 'refundable') return 'Refundable Transaction';
      if (stType === 'refund') return 'Refund Transaction';
      return 'Transfer Transaction';
    }
    if (txn.asset_trade_txn) return 'Asset Trade';
    return 'Transaction';
  };

  const getTxnTypeColor = () => {
    if (txn.income_txn) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (txn.expense_txn) return 'bg-rose-100 text-rose-800 border-rose-200';
    if (txn.self_transfer_or_refundable_or_refund_txn) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (txn.asset_trade_txn) return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Transaction</h1>
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getTxnTypeColor()}`}>
                {getTxnTypeLabel()}
              </div>
            </div>
            <button
              onClick={() => router.push(`/transactions/${txn.id}`)}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Basic Details Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>
              Basic Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter transaction description"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date (dd-mm-yyyy)</label>
                <input
                  type="text"
                  placeholder="dd-mm-yyyy"
                  value={dateStr}
                  onChange={e => setDateStr(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-red-800 text-sm font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Income Transaction */}
          {txn.income_txn && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                  Income Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                    <select
                      value={incomeAssetId}
                      onChange={e => setIncomeAssetId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    >
                      {initial_assets.map((a: Asset) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                    <select
                      value={incomeAccountId}
                      onChange={e => setIncomeAccountId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    >
                      {initial_accounts.map((ac: Account) => (
                        <option key={ac.id} value={ac.id}>
                          {ac.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      value={incomeQuantity}
                      onChange={e => setIncomeQuantity(Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                    Purpose Bucket Allocations
                  </h2>
                  <button
                    type="button"
                    onClick={addIncomeAlloc}
                    className="inline-flex items-center px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors shadow-sm"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Allocation
                  </button>
                </div>
                <div className="space-y-3">
                  {incomeAllocs.map((alloc, idx) => (
                    <div
                      key={alloc.id ?? `new-${idx}`}
                      className={`flex gap-3 items-center p-3 rounded-lg border transition-all ${
                        alloc.markedForDelete
                          ? 'bg-gray-50 border-gray-200 opacity-50'
                          : 'bg-gray-50 border-gray-200 hover:border-emerald-300'
                      }`}
                    >
                      <select
                        value={alloc.purpose_bucket_id}
                        onChange={e => updateIncomeAlloc(idx, { purpose_bucket_id: e.target.value })}
                        disabled={alloc.markedForDelete}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        {initial_buckets.map((b: Bucket) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={alloc.quantity}
                        onChange={e => updateIncomeAlloc(idx, { quantity: Number(e.target.value) })}
                        disabled={alloc.markedForDelete}
                        placeholder="Quantity"
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:bg-gray-100"
                      />
                      <button
                        type="button"
                        onClick={() => removeIncomeAlloc(idx)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          alloc.markedForDelete
                            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {alloc.markedForDelete ? 'Undo' : 'Delete'}
                      </button>
                    </div>
                  ))}
                  {incomeAllocs.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No allocations yet. Click "Add Allocation" to get started.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Expense Transaction */}
          {txn.expense_txn && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-2 h-2 bg-rose-500 rounded-full mr-2"></span>
                Expense Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                  <select
                    value={expenseAssetId}
                    onChange={e => setExpenseAssetId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  >
                    {initial_assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                  <select
                    value={expenseAccountId}
                    onChange={e => setExpenseAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={expenseQuantity}
                    onChange={e => setExpenseQuantity(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Purpose Bucket</label>
                  <select
                    value={expensePurposeBucketId}
                    onChange={e => setExpensePurposeBucketId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  >
                    {initial_buckets.map((b: Bucket) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Self Transfer / Refundable / Refund */}
          {txn.self_transfer_or_refundable_or_refund_txn && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                Transfer Details
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                    <select
                      value={stType}
                      onChange={e => setStType(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="self_transfer">Self Transfer</option>
                      <option value="refundable">Refundable</option>
                      <option value="refund">Refund</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                    <select
                      value={stAssetId}
                      onChange={e => setStAssetId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      {initial_assets.map((a: Asset) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">From Account</label>
                    <select
                      value={stFromAccountId}
                      onChange={e => setStFromAccountId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      {initial_accounts.map((ac: Account) => (
                        <option key={ac.id} value={ac.id}>
                          {ac.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">To Account</label>
                    <select
                      value={stToAccountId}
                      onChange={e => setStToAccountId(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      {initial_accounts.map((ac: Account) => (
                        <option key={ac.id} value={ac.id}>
                          {ac.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                    <input
                      type="number"
                      step="any"
                      value={stQuantity}
                      onChange={e => setStQuantity(Number(e.target.value))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Asset Trade */}
          {txn.asset_trade_txn && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                  Asset Trade Details
                </h2>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <svg className="w-4 h-4 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                      Debit (Outgoing)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                        <select
                          value={debitAssetId}
                          onChange={e => setDebitAssetId(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        >
                          {initial_assets.map((a: Asset) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                        <select
                          value={debitAccountId}
                          onChange={e => setDebitAccountId(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        >
                          {initial_accounts.map((ac: Account) => (
                            <option key={ac.id} value={ac.id}>
                              {ac.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={debitQuantity}
                          onChange={e => setDebitQuantity(Number(e.target.value))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Credit (Incoming)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                        <select
                          value={creditAssetId}
                          onChange={e => setCreditAssetId(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        >
                          {initial_assets.map((a: Asset) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                        <select
                          value={creditAccountId}
                          onChange={e => setCreditAccountId(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        >
                          {initial_accounts.map((ac: Account) => (
                            <option key={ac.id} value={ac.id}>
                              {ac.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={creditQuantity}
                          onChange={e => setCreditQuantity(Number(e.target.value))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                    Asset Replacements by Purpose Bucket
                  </h2>
                  <button
                    type="button"
                    onClick={addAssetReplacement}
                    className="inline-flex items-center px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors shadow-sm"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Replacement
                  </button>
                </div>
                <div className="space-y-3">
                  {assetReplacements.map((r, idx) => (
                    <div
                      key={r.id ?? `new-rep-${idx}`}
                      className={`flex gap-3 items-center p-3 rounded-lg border transition-all ${
                        r.markedForDelete
                          ? 'bg-gray-50 border-gray-200 opacity-50'
                          : 'bg-gray-50 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      <select
                        value={r.purpose_bucket_id}
                        onChange={e => updateAssetReplacement(idx, { purpose_bucket_id: e.target.value })}
                        disabled={r.markedForDelete}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                      >
                        {initial_buckets.map((b: Bucket) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="any"
                          value={r.debit_quantity}
                          onChange={e => updateAssetReplacement(idx, { debit_quantity: Number(e.target.value) })}
                          disabled={r.markedForDelete}
                          placeholder="Debit"
                          className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                        />
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <input
                          type="number"
                          step="any"
                          value={r.credit_quantity}
                          onChange={e => updateAssetReplacement(idx, { credit_quantity: Number(e.target.value) })}
                          disabled={r.markedForDelete}
                          placeholder="Credit"
                          className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAssetReplacement(idx)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          r.markedForDelete
                            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {r.markedForDelete ? 'Undo' : 'Delete'}
                      </button>
                    </div>
                  ))}
                  {assetReplacements.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No replacements yet. Click "Add Replacement" to get started.</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex gap-3 justify-end">
              <a
                href={`/transactions/${txn.id}`}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </a>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
              >
                {saving ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}