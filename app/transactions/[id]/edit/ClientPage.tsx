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

export default function ClientPage({
  initial_data,
  initial_buckets,
  initial_assets,
  initial_accounts,
}: {
  initial_data: any;
  initial_buckets: { id: string; name: string }[];
  initial_assets: { id: string; name: string }[];
  initial_accounts: { id: string; name: string }[];
}) {
  const txn = initial_data;
  const router = useRouter();
  const [description, setDescription] = useState(txn.description || '');
  const [dateStr, setDateStr] = useState(() => {
    // convert existing date to yyyy-mm-dd for input if present
    const d = txn.income_txn?.date || txn.expense_txn?.date || txn.self_transfer_or_refundable_or_refund_txn?.date || txn.asset_trade_txn?.debit_date;
    if (!d) return '';
    const dt = new Date(String(d));
    // convert to dd-mm-yyyy for text input
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

  // assets & accounts state (for selects)
  type Asset = { id: string; name: string };
  type Account = { id: string; name: string };

  // Income txn editable fields
  const [incomeAssetId, setIncomeAssetId] = useState<string | undefined>(txn.income_txn?.asset_id ?? initial_assets[0]?.id);
  const [incomeAccountId, setIncomeAccountId] = useState<string | undefined>(txn.income_txn?.account_id ?? initial_accounts[0]?.id);
  const [incomeQuantity, setIncomeQuantity] = useState<number>(txn.income_txn?.quantity ?? 0);

  // Expense txn editable fields
  const [expenseAssetId, setExpenseAssetId] = useState<string | undefined>(txn.expense_txn?.asset_id ?? initial_assets[0]?.id);
  const [expenseAccountId, setExpenseAccountId] = useState<string | undefined>(txn.expense_txn?.account_id ?? initial_accounts[0]?.id);
  const [expenseQuantity, setExpenseQuantity] = useState<number>(txn.expense_txn?.quantity ?? 0);
  const [expensePurposeBucketId, setExpensePurposeBucketId] = useState<string | undefined>(
    txn.expense_txn?.purpose_bucket_id ?? initial_buckets[0]?.id
  );

  // Self transfer / refundable / refund editable fields
  const [stType, setStType] = useState<string | undefined>(txn.type ?? undefined);
  const [stAssetId, setStAssetId] = useState<string | undefined>(txn.self_transfer_or_refundable_or_refund_txn?.asset_id ?? initial_assets[0]?.id);
  const [stFromAccountId, setStFromAccountId] = useState<string | undefined>(
    txn.self_transfer_or_refundable_or_refund_txn?.from_account_id ?? initial_accounts[0]?.id
  );
  const [stToAccountId, setStToAccountId] = useState<string | undefined>(
    txn.self_transfer_or_refundable_or_refund_txn?.to_account_id ?? initial_accounts[0]?.id
  );
  const [stQuantity, setStQuantity] = useState<number>(txn.self_transfer_or_refundable_or_refund_txn?.quantity ?? 0);

  // Asset trade editable fields
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
      // dateStr is expected in dd-mm-yyyy format from the text input
      const datePayload = dateStr ? dateStr : undefined;

      if (txn.income_txn) {
        // prepare create/update/delete payloads for allocations
        const creates = incomeAllocs
          .filter(a => !a.id && !a.markedForDelete)
          .map(a => ({ purpose_bucket_id: a.purpose_bucket_id, quantity: Number(a.quantity) }));
        const updates = incomeAllocs
          .filter(a => a.id && !a.markedForDelete)
          .map(a => ({ id: a.id!, purpose_bucket_id: a.purpose_bucket_id, quantity: Number(a.quantity) }));
        const deletes = incomeAllocs.filter(a => a.id && a.markedForDelete).map(a => ({ id: a.id! }));

        // optional client-side validation: if transaction quantity present, ensure allocations sum to it
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

        // optional client-side validation for asset replacements: ensure sums match updated debit/credit
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Edit Transaction</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Date (dd-mm-yyyy)</label>
            <input
              type="text"
              placeholder="dd-mm-yyyy"
              value={dateStr}
              onChange={e => setDateStr(e.target.value)}
              className="mt-1 block w-full border rounded px-3 py-2"
            />
          </div>

          {error && <div className="text-red-600">{error}</div>}

          {/* Income: asset/account/quantity fields */}
          {txn.income_txn && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm">Asset</label>
                  <select
                    value={incomeAssetId}
                    onChange={e => setIncomeAssetId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Account</label>
                  <select
                    value={incomeAccountId}
                    onChange={e => setIncomeAccountId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Quantity</label>
                  <input
                    type="number"
                    value={incomeQuantity}
                    onChange={e => setIncomeQuantity(Number(e.target.value))}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Expense: asset/account/quantity/purpose bucket */}
          {txn.expense_txn && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-sm">Asset</label>
                  <select
                    value={expenseAssetId}
                    onChange={e => setExpenseAssetId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Account</label>
                  <select
                    value={expenseAccountId}
                    onChange={e => setExpenseAccountId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Quantity</label>
                  <input
                    type="number"
                    value={expenseQuantity}
                    onChange={e => setExpenseQuantity(Number(e.target.value))}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-sm">Bucket</label>
                  <select
                    value={expensePurposeBucketId}
                    onChange={e => setExpensePurposeBucketId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
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

          {/* Self-transfer / refundable / refund */}
          {txn.self_transfer_or_refundable_or_refund_txn && (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-sm">Type</label>
                  <select value={stType} onChange={e => setStType(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                    <option value="self_transfer">self_transfer</option>
                    <option value="refundable">refundable</option>
                    <option value="refund">refund</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Asset</label>
                  <select value={stAssetId} onChange={e => setStAssetId(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                    {initial_assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">From account</label>
                  <select
                    value={stFromAccountId}
                    onChange={e => setStFromAccountId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">To account</label>
                  <select
                    value={stToAccountId}
                    onChange={e => setStToAccountId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm">Quantity</label>
                <input
                  type="number"
                  value={stQuantity}
                  onChange={e => setStQuantity(Number(e.target.value))}
                  className="mt-1 block w-40 border rounded px-2 py-1"
                />
              </div>
            </div>
          )}

          {/* Asset-trade editable fields */}
          {txn.asset_trade_txn && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm">Debit asset</label>
                  <select value={debitAssetId} onChange={e => setDebitAssetId(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                    {initial_assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Debit account</label>
                  <select
                    value={debitAccountId}
                    onChange={e => setDebitAccountId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Debit qty</label>
                  <input
                    type="number"
                    value={debitQuantity}
                    onChange={e => setDebitQuantity(Number(e.target.value))}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm">Credit asset</label>
                  <select
                    value={creditAssetId}
                    onChange={e => setCreditAssetId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_assets.map((a: Asset) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Credit account</label>
                  <select
                    value={creditAccountId}
                    onChange={e => setCreditAccountId(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    {initial_accounts.map((ac: Account) => (
                      <option key={ac.id} value={ac.id}>
                        {ac.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Credit qty</label>
                  <input
                    type="number"
                    value={creditQuantity}
                    onChange={e => setCreditQuantity(Number(e.target.value))}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Income allocations editor */}
          {txn.income_txn && (
            <div>
              <h3 className="text-sm font-medium text-gray-800">Allocations</h3>
              <div className="mt-2 space-y-2">
                {incomeAllocs.map((alloc, idx) => (
                  <div key={alloc.id ?? `new-${idx}`} className={`flex gap-2 items-center ${alloc.markedForDelete ? 'opacity-50 line-through' : ''}`}>
                    <select
                      value={alloc.purpose_bucket_id}
                      onChange={e => updateIncomeAlloc(idx, { purpose_bucket_id: e.target.value })}
                      className="border rounded px-2 py-1"
                    >
                      {initial_buckets.map((b: Bucket) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={alloc.quantity}
                      onChange={e => updateIncomeAlloc(idx, { quantity: Number(e.target.value) })}
                      className="border rounded px-2 py-1 w-32"
                    />
                    <button type="button" onClick={() => removeIncomeAlloc(idx)} className="px-2 py-1 bg-rose-200 rounded">
                      {alloc.markedForDelete ? 'Undo' : 'Delete'}
                    </button>
                  </div>
                ))}

                <div>
                  <button type="button" onClick={addIncomeAlloc} className="px-3 py-1 bg-sky-200 rounded">
                    Add allocation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Asset trade replacements editor */}
          {txn.asset_trade_txn && (
            <div>
              <h3 className="text-sm font-medium text-gray-800">Asset replacements (per purpose bucket)</h3>
              <div className="mt-2 space-y-2">
                {assetReplacements.map((r, idx) => (
                  <div key={r.id ?? `new-rep-${idx}`} className={`flex gap-2 items-center ${r.markedForDelete ? 'opacity-50 line-through' : ''}`}>
                    <select
                      value={r.purpose_bucket_id}
                      onChange={e => updateAssetReplacement(idx, { purpose_bucket_id: e.target.value })}
                      className="border rounded px-2 py-1"
                    >
                      {initial_buckets.map((b: Bucket) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={r.debit_quantity}
                      onChange={e => updateAssetReplacement(idx, { debit_quantity: Number(e.target.value) })}
                      className="border rounded px-2 py-1 w-24"
                      placeholder="debit"
                    />
                    <input
                      type="number"
                      value={r.credit_quantity}
                      onChange={e => updateAssetReplacement(idx, { credit_quantity: Number(e.target.value) })}
                      className="border rounded px-2 py-1 w-24"
                      placeholder="credit"
                    />
                    <button type="button" onClick={() => removeAssetReplacement(idx)} className="px-2 py-1 bg-rose-200 rounded">
                      {r.markedForDelete ? 'Undo' : 'Delete'}
                    </button>
                  </div>
                ))}
                <div>
                  <button type="button" onClick={addAssetReplacement} className="px-3 py-1 bg-sky-200 rounded">
                    Add replacement
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-rose-500 text-white rounded">
              Save
            </button>
            <a href={`/transactions/${txn.id}`} className="px-4 py-2 border rounded">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
