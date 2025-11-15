'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  create_income_transaction,
  create_expense_transaction,
  create_self_transfer_or_refundable_or_refund_transaction,
  create_asset_trade_transaction,
} from '@/server actions/transaction/create';
import { get_indian_date_from_date_obj } from '@/utils/date';

type AssetRef = { id: string; name: string };
type AccountRef = { id: string; name: string };
type BucketRef = { id: string; name: string };

export default function ClientPage({
  assets,
  accounts,
  purpose_buckets,
}: {
  assets: AssetRef[];
  accounts: AccountRef[];
  purpose_buckets: BucketRef[];
}) {
  const [type, setType] = useState<'income' | 'expense' | 'self_transfer' | 'refundable' | 'refund' | 'asset_trade'>('income');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // common fields
  const [description, setDescription] = useState('');

  // income fields
  const [incomeAsset, setIncomeAsset] = useState(assets[0]?.id || '');
  const [incomeAccount, setIncomeAccount] = useState(accounts[0]?.id || '');
  const [incomeQty, setIncomeQty] = useState<number>(0);
  const [incomeDate, setIncomeDate] = useState(get_indian_date_from_date_obj(new Date()));
  const [incomeAllocations, setIncomeAllocations] = useState<{ purpose_bucket_id: string; quantity: number }[]>([]);

  // expense fields
  const [expenseAsset, setExpenseAsset] = useState(assets[0]?.id || '');
  const [expenseAccount, setExpenseAccount] = useState(accounts[0]?.id || '');
  const [expenseQty, setExpenseQty] = useState<number>(0);
  const [expenseDate, setExpenseDate] = useState(get_indian_date_from_date_obj(new Date()));
  const [expenseBucket, setExpenseBucket] = useState(purpose_buckets[0]?.id || '');

  // transfer/refund
  const [txnAsset, setTxnAsset] = useState(assets[0]?.id || '');
  const [fromAccount, setFromAccount] = useState(accounts[0]?.id || '');
  const [toAccount, setToAccount] = useState(accounts[0]?.id || '');
  const [txnQuantity, setTxnQuantity] = useState<number>(0);
  const [txnDate, setTxnDate] = useState(get_indian_date_from_date_obj(new Date()));

  // asset trade
  const [debitAsset, setDebitAsset] = useState(assets[0]?.id || '');
  const [debitAccount, setDebitAccount] = useState(accounts[0]?.id || '');
  const [debitQty, setDebitQty] = useState<number>(0);
  const [creditAsset, setCreditAsset] = useState(assets[0]?.id || '');
  const [creditAccount, setCreditAccount] = useState(accounts[0]?.id || '');
  const [creditQty, setCreditQty] = useState<number>(0);
  const [tradeDate, setTradeDate] = useState(get_indian_date_from_date_obj(new Date()));
  const [replacements, setReplacements] = useState<{ purpose_bucket_id: string; debit_quantity: number; credit_quantity: number }[]>([]);

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    try {
      let res: any = null;
      if (type === 'income') {
        res = await create_income_transaction({
          description: description || undefined,
          date: incomeDate,
          asset_id: incomeAsset,
          account_id: incomeAccount,
          quantity: incomeQty,
          allocation_to_purpose_buckets: incomeAllocations,
        });
      } else if (type === 'expense') {
        res = await create_expense_transaction({
          description: description || undefined,
          date: expenseDate,
          asset_id: expenseAsset,
          account_id: expenseAccount,
          quantity: expenseQty,
          purpose_bucket_id: expenseBucket,
        });
      } else if (type === 'self_transfer' || type === 'refundable' || type === 'refund') {
        res = await create_self_transfer_or_refundable_or_refund_transaction({
          type: type as any,
          description: description || undefined,
          date: txnDate,
          asset_id: txnAsset,
          from_account_id: fromAccount,
          to_account_id: toAccount,
          quantity: txnQuantity,
        });
      } else if (type === 'asset_trade') {
        res = await create_asset_trade_transaction({
          description: description || undefined,
          debit_asset_id: debitAsset,
          debit_account_id: debitAccount,
          debit_quantity: debitQty,
          credit_asset_id: creditAsset,
          credit_account_id: creditAccount,
          credit_quantity: creditQty,
          date: tradeDate,
          asset_replacement_in_purpose_buckets: replacements,
        });
      }

      const id = res?.id;
      if (id) {
        router.push(`/transactions/${id}`);
        return;
      }

      setSuccess('Transaction created');
      // reset minimal fields
      setDescription('');
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Create Transaction</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as any)}
              className="mt-1 block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="self_transfer">Self Transfer</option>
              <option value="refundable">Refundable</option>
              <option value="refund">Refund</option>
              <option value="asset_trade">Asset Trade</option>
            </select>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="mt-1 block w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          {type === 'income' && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2"></span>
                Income Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                  <select
                    value={incomeAsset}
                    onChange={e => setIncomeAsset(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                  <select
                    value={incomeAccount}
                    onChange={e => setIncomeAccount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={String(incomeQty)}
                    onChange={e => setIncomeQty(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Date (dd-MM-yyyy)</label>
                <input
                  value={incomeDate}
                  onChange={e => setIncomeDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Purpose Bucket Allocations</h3>
                <div className="space-y-3">
                  {incomeAllocations.map((apb, i) => (
                    <div key={i} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 rounded-lg border bg-gray-50">
                      <select
                        value={apb.purpose_bucket_id}
                        onChange={e => setIncomeAllocations(s => s.map((x, ii) => (ii === i ? { ...x, purpose_bucket_id: e.target.value } : x)))}
                        className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {purpose_buckets.map(pb => (
                          <option key={pb.id} value={pb.id}>
                            {pb.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={String(apb.quantity)}
                        onChange={e => setIncomeAllocations(s => s.map((x, ii) => (ii === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                        className="w-full sm:w-32 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setIncomeAllocations(s => s.filter((_, ii) => ii !== i))}
                        className="w-full sm:w-auto px-4 py-2 bg-red-100 text-red-700 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIncomeAllocations(s => [...s, { purpose_bucket_id: purpose_buckets[0]?.id || '', quantity: 0 }])}
                    className="inline-flex items-center px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
                  >
                    Add Allocation
                  </button>
                </div>
              </div>
            </div>
          )}

          {type === 'expense' && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-2 h-2 bg-rose-500 rounded-full mr-2"></span>
                Expense Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                  <select
                    value={expenseAsset}
                    onChange={e => setExpenseAsset(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                  <select
                    value={expenseAccount}
                    onChange={e => setExpenseAccount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={String(expenseQty)}
                    onChange={e => setExpenseQty(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Purpose Bucket</label>
                  <select
                    value={expenseBucket}
                    onChange={e => setExpenseBucket(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    {purpose_buckets.map(pb => (
                      <option key={pb.id} value={pb.id}>
                        {pb.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date (dd-MM-yyyy)</label>
                  <input
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {(type === 'self_transfer' || type === 'refundable' || type === 'refund') && (
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                Transfer Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Asset</label>
                  <select
                    value={txnAsset}
                    onChange={e => setTxnAsset(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">From Account</label>
                  <select
                    value={fromAccount}
                    onChange={e => setFromAccount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">To Account</label>
                  <select
                    value={toAccount}
                    onChange={e => setToAccount(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input
                    type="number"
                    step="any"
                    value={String(txnQuantity)}
                    onChange={e => setTxnQuantity(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date (dd-MM-yyyy)</label>
                  <input
                    placeholder="dd-MM-yyyy"
                    value={txnDate}
                    onChange={e => setTxnDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {type === 'asset_trade' && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                  Asset Trade Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-red-700 mb-3">Debit (Outgoing)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Asset</label>
                        <select
                          value={debitAsset}
                          onChange={e => setDebitAsset(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          {assets.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Account</label>
                        <select
                          value={debitAccount}
                          onChange={e => setDebitAccount(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={String(debitQty)}
                          onChange={e => setDebitQty(Number(e.target.value))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-green-700 mb-3">Credit (Incoming)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Asset</label>
                        <select
                          value={creditAsset}
                          onChange={e => setCreditAsset(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          {assets.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Account</label>
                        <select
                          value={creditAccount}
                          onChange={e => setCreditAccount(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-2">Quantity</label>
                        <input
                          type="number"
                          step="any"
                          value={String(creditQty)}
                          onChange={e => setCreditQty(Number(e.target.value))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm text-gray-700 mb-2">Date (dd-MM-yyyy)</label>
                  <input
                    placeholder="dd-MM-yyyy"
                    value={tradeDate}
                    onChange={e => setTradeDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Asset Replacements by Purpose Bucket</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setReplacements(s => [...s, { purpose_bucket_id: purpose_buckets[0]?.id || '', debit_quantity: 0, credit_quantity: 0 }])
                    }
                    className="inline-flex items-center px-4 py-2 bg-purple-500 text-white text-sm font-medium rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    Add Replacement
                  </button>
                </div>
                <div className="space-y-3">
                  {replacements.map((r, i) => (
                    <div
                      key={i}
                      className="flex flex-col sm:flex-row gap-3 items-start sm:items-center p-3 rounded-lg bg-white border border-gray-100 hover:shadow-sm"
                    >
                      <select
                        value={r.purpose_bucket_id}
                        onChange={e => setReplacements(s => s.map((x, ii) => (ii === i ? { ...x, purpose_bucket_id: e.target.value } : x)))}
                        className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {purpose_buckets.map(pb => (
                          <option key={pb.id} value={pb.id}>
                            {pb.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={String(r.debit_quantity)}
                        onChange={e => setReplacements(s => s.map((x, ii) => (ii === i ? { ...x, debit_quantity: Number(e.target.value) } : x)))}
                        className="w-full sm:w-28 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <input
                        type="number"
                        step="any"
                        value={String(r.credit_quantity)}
                        onChange={e => setReplacements(s => s.map((x, ii) => (ii === i ? { ...x, credit_quantity: Number(e.target.value) } : x)))}
                        className="w-full sm:w-28 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setReplacements(s => s.filter((_, ii) => ii !== i))}
                        className="w-full sm:w-auto px-4 py-2 bg-red-100 text-red-700 rounded-lg"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
              <p className="text-red-800 text-sm font-medium">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
              <p className="text-green-800 text-sm font-medium">{success}</p>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex gap-3 justify-end">
              <a
                href="/transactions"
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </a>
              <button
                type="submit"
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
              >
                Create
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
