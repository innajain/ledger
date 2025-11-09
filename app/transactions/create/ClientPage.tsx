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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Create Transaction</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Type</label>
            <select value={type} onChange={e => setType(e.target.value as any)} className="mt-1 block w-full border rounded px-3 py-2">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="self_transfer">Self Transfer</option>
              <option value="refundable">Refundable</option>
              <option value="refund">Refund</option>
              <option value="asset_trade">Asset Trade</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          {type === 'income' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <select value={incomeAsset} onChange={e => setIncomeAsset(e.target.value)} className="border rounded px-2 py-1">
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select value={incomeAccount} onChange={e => setIncomeAccount(e.target.value)} className="border rounded px-2 py-1">
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={String(incomeQty)}
                  onChange={e => setIncomeQty(Number(e.target.value))}
                  className="border rounded px-2 py-1"
                />
              </div>
              <div>
                <label className="text-sm">Date (dd-MM-yyyy)</label>
                <input value={incomeDate} onChange={e => setIncomeDate(e.target.value)} className="block w-full border rounded px-2 py-1 mt-1" />
              </div>

              <div>
                <label className="text-sm">Allocations</label>
                <div className="space-y-2 mt-2">
                  {incomeAllocations.map((apb, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        value={apb.purpose_bucket_id}
                        onChange={e => setIncomeAllocations(s => s.map((x, ii) => (ii === i ? { ...x, purpose_bucket_id: e.target.value } : x)))}
                        className="border rounded px-2 py-1"
                      >
                        {purpose_buckets.map(pb => (
                          <option key={pb.id} value={pb.id}>
                            {pb.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={String(apb.quantity)}
                        onChange={e => setIncomeAllocations(s => s.map((x, ii) => (ii === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                        className="border rounded px-2 py-1"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIncomeAllocations(s => [...s, { purpose_bucket_id: purpose_buckets[0]?.id || '', quantity: 0 }])}
                    className="text-sm px-2 py-1 bg-gray-100 rounded mt-2"
                  >
                    Add Allocation
                  </button>
                </div>
              </div>
            </div>
          )}

          {type === 'expense' && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <select value={expenseAsset} onChange={e => setExpenseAsset(e.target.value)} className="border rounded px-2 py-1">
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select value={expenseAccount} onChange={e => setExpenseAccount(e.target.value)} className="border rounded px-2 py-1">
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={String(expenseQty)}
                  onChange={e => setExpenseQty(Number(e.target.value))}
                  className="border rounded px-2 py-1"
                />
              </div>
              <div>
                <select value={expenseBucket} onChange={e => setExpenseBucket(e.target.value)} className="border rounded px-2 py-1">
                  {purpose_buckets.map(pb => (
                    <option key={pb.id} value={pb.id}>
                      {pb.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm">Date (dd-MM-yyyy)</label>
                <input value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="block w-full border rounded px-2 py-1 mt-1" />
              </div>
            </div>
          )}

          {(type === 'self_transfer' || type === 'refundable' || type === 'refund') && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <select value={txnAsset} onChange={e => setTxnAsset(e.target.value)} className="border rounded px-2 py-1">
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select value={fromAccount} onChange={e => setFromAccount(e.target.value)} className="border rounded px-2 py-1">
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select value={toAccount} onChange={e => setToAccount(e.target.value)} className="border rounded px-2 py-1">
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={String(txnQuantity)}
                  onChange={e => setTxnQuantity(Number(e.target.value))}
                  className="border rounded px-2 py-1"
                />
                <input placeholder="dd-MM-yyyy" value={txnDate} onChange={e => setTxnDate(e.target.value)} className="border rounded px-2 py-1" />
              </div>
            </div>
          )}

          {type === 'asset_trade' && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <select value={debitAsset} onChange={e => setDebitAsset(e.target.value)} className="border rounded px-2 py-1">
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select value={debitAccount} onChange={e => setDebitAccount(e.target.value)} className="border rounded px-2 py-1">
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={String(debitQty)}
                  onChange={e => setDebitQty(Number(e.target.value))}
                  className="border rounded px-2 py-1"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <select value={creditAsset} onChange={e => setCreditAsset(e.target.value)} className="border rounded px-2 py-1">
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select value={creditAccount} onChange={e => setCreditAccount(e.target.value)} className="border rounded px-2 py-1">
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={String(creditQty)}
                  onChange={e => setCreditQty(Number(e.target.value))}
                  className="border rounded px-2 py-1"
                />
                <input placeholder="dd-MM-yyyy" value={tradeDate} onChange={e => setTradeDate(e.target.value)} className="border rounded px-2 py-1" />
              </div>

              <div>
                <label className="text-sm">Purpose bucket replacements</label>
                <div className="space-y-2 mt-2">
                  {replacements.map((r, i) => (
                    <div key={i} className="flex gap-2">
                      <select
                        value={r.purpose_bucket_id}
                        onChange={e => setReplacements(s => s.map((x, ii) => (ii === i ? { ...x, purpose_bucket_id: e.target.value } : x)))}
                        className="border rounded px-2 py-1"
                      >
                        {purpose_buckets.map(pb => (
                          <option key={pb.id} value={pb.id}>
                            {pb.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={String(r.debit_quantity)}
                        onChange={e => setReplacements(s => s.map((x, ii) => (ii === i ? { ...x, debit_quantity: Number(e.target.value) } : x)))}
                        className="border rounded px-2 py-1"
                      />
                      <input
                        type="number"
                        value={String(r.credit_quantity)}
                        onChange={e => setReplacements(s => s.map((x, ii) => (ii === i ? { ...x, credit_quantity: Number(e.target.value) } : x)))}
                        className="border rounded px-2 py-1"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setReplacements(s => [...s, { purpose_bucket_id: purpose_buckets[0]?.id || '', debit_quantity: 0, credit_quantity: 0 }])
                    }
                    className="text-sm px-2 py-1 bg-gray-100 rounded mt-2"
                  >
                    Add replacement
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && <div className="text-red-600">{error}</div>}
          {success && <div className="text-green-600">{success}</div>}

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-rose-500 text-white rounded">
              Create
            </button>
            <a href="/transactions" className="px-4 py-2 border rounded">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
