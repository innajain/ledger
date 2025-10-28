"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { update_account } from '@/server actions/account/update';
import { toDecimal } from '@/utils/decimal';
import { get_indian_date_from_date_obj, getCurrentIndianDate } from '@/utils/date';

type Alloc = { id?: string; purpose_bucket_id: string; quantity: number; _deleted?: boolean };
type OpeningBalanceState = { id?: string; asset_id: string; quantity: number; date: string; allocations: Alloc[] };

export default function ClientPage({ initial_data, initial_assets, initial_buckets }: { initial_data: any; initial_assets: { id: string; name: string }[]; initial_buckets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(initial_data.name || '');
  const [openingBalances, setOpeningBalances] = useState<OpeningBalanceState[]>(() => {
    return (initial_data.opening_balances || []).map((ob: any) => ({
      id: ob.id,
      asset_id: ob.asset?.id || ob.asset_id,
      quantity: ob.quantity,
      date: ob.date ? get_indian_date_from_date_obj(new Date(ob.date)) : getCurrentIndianDate(),
      allocations: (ob.allocation_to_purpose_buckets || []).map((a: any) => ({ id: a.id, purpose_bucket_id: a.purpose_bucket_id, quantity: a.quantity })),
    }));
  });

  const [openingBalanceDeletes, setOpeningBalanceDeletes] = useState<{ asset_id: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addOpeningBalance() {
    setOpeningBalances(prev => [...prev, { asset_id: initial_assets[0]?.id || '', quantity: 0, date: getCurrentIndianDate(), allocations: [] }]);
  }

  function removeOpeningBalance(index: number) {
    setOpeningBalances(prev => {
      const ob = prev[index];
      if (ob.id) {
        setOpeningBalanceDeletes(d => [...d, { asset_id: ob.asset_id }]);
      }
      const next = prev.slice();
      next.splice(index, 1);
      return next;
    });
  }

  function addAllocation(obIndex: number) {
    setOpeningBalances(prev => prev.map((ob, i) => (i === obIndex ? { ...ob, allocations: [...ob.allocations, { purpose_bucket_id: initial_buckets[0]?.id || '', quantity: 0 }] } : ob)));
  }

  function removeAllocation(obIndex: number, allocIndex: number) {
    setOpeningBalances(prev => prev.map((ob, i) => {
      if (i !== obIndex) return ob;
      const alloc = ob.allocations[allocIndex];
      if (alloc && alloc.id) {
        // mark deleted
        return { ...ob, allocations: ob.allocations.map((a, ai) => ai === allocIndex ? { ...a, _deleted: true } : a) };
      }
      // new allocation - just remove
      return { ...ob, allocations: ob.allocations.filter((_, ai) => ai !== allocIndex) };
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Validate sums
      for (const ob of openingBalances) {
        const allocSum = ob.allocations.filter(a => !a._deleted).reduce((s, a) => s.plus(toDecimal(a.quantity || 0)), toDecimal(0));
        if (!toDecimal(ob.quantity).equals(allocSum)) throw new Error(`Opening balance for asset ${ob.asset_id} must equal sum of allocations (${allocSum.toNumber()})`);
      }

      const creates = openingBalances.filter(ob => !ob.id).map(ob => ({
        asset_id: ob.asset_id,
        quantity: toDecimal(ob.quantity).toNumber(),
        date: ob.date || getCurrentIndianDate(),
        allocation_to_purpose_buckets: ob.allocations.filter(a => !a.id).filter(a => !a._deleted).map(a => ({ purpose_bucket_id: a.purpose_bucket_id, quantity: toDecimal(a.quantity).toNumber() })),
      }));

  const updates = openingBalances.filter(ob => ob.id).map(ob => ({
    id: ob.id as string,
    asset_id: ob.asset_id,
    quantity: toDecimal(ob.quantity).toNumber(),
    date: ob.date || getCurrentIndianDate(),
  allocation_to_purpose_buckets_creates: ob.allocations.filter(a => !a.id && !a._deleted).map(a => ({ purpose_bucket_id: a.purpose_bucket_id, quantity: toDecimal(a.quantity).toNumber() })),
  allocation_to_purpose_buckets_deletes: ob.allocations.filter(a => a.id && a._deleted).map(a => ({ id: a.id! })),
  allocation_to_purpose_buckets_updates: ob.allocations.filter(a => a.id && !a._deleted).map(a => ({ id: a.id!, purpose_bucket_id: a.purpose_bucket_id, quantity: toDecimal(a.quantity).toNumber() })),
  }));

      const deletes = openingBalanceDeletes;

      await update_account(initial_data.id, { name, opening_balance_creates: creates, opening_balance_updates: updates, opening_balance_deletes: deletes });
      router.push(`/accounts/${initial_data.id}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Edit Account</h1>

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Opening Balances</h2>
              <button type="button" onClick={addOpeningBalance} className="px-3 py-1 bg-emerald-500 text-white rounded">Add Opening Balance</button>
            </div>

            <div className="mt-3 space-y-3">
              {openingBalances.map((ob, i) => (
                <div key={ob.id || `new-${i}`} className="p-3 border rounded">
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="block text-xs">Asset</label>
                      <select value={ob.asset_id} onChange={e => setOpeningBalances(prev => prev.map((p, idx) => idx === i ? { ...p, asset_id: e.target.value } : p))} className="mt-1 block w-full border rounded px-2 py-1">
                        {initial_assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs">Quantity</label>
                      <input type="number" value={ob.quantity as any} onChange={e => setOpeningBalances(prev => prev.map((p, idx) => idx === i ? { ...p, quantity: Number(e.target.value) } : p))} className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                    <div>
                      <label className="block text-xs">Date (DD-MM-YYYY)</label>
                      <input type="text" value={ob.date} onChange={e => setOpeningBalances(prev => prev.map((p, idx) => idx === i ? { ...p, date: e.target.value } : p))} placeholder="dd-mm-yyyy" className="mt-1 block w-full border rounded px-2 py-1" />
                    </div>
                    <div className="text-right">
                      <button type="button" onClick={() => removeOpeningBalance(i)} className="px-3 py-1 bg-red-500 text-white rounded">Remove</button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">Allocations</div>
                      <button type="button" onClick={() => addAllocation(i)} className="text-sm px-2 py-1 bg-emerald-200 rounded">Add Allocation</button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {ob.allocations.map((a, ai) => a._deleted ? null : (
                        <div key={a.id || `na-${ai}`} className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="block text-xs">Bucket</label>
                            <select value={a.purpose_bucket_id} onChange={e => setOpeningBalances(prev => prev.map((p, idx) => idx === i ? { ...p, allocations: p.allocations.map((aa, aidx) => aidx === ai ? { ...aa, purpose_bucket_id: e.target.value } : aa) } : p))} className="mt-1 block w-full border rounded px-2 py-1">
                              {initial_buckets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs">Quantity</label>
                            <input type="number" value={a.quantity as any} onChange={e => setOpeningBalances(prev => prev.map((p, idx) => idx === i ? { ...p, allocations: p.allocations.map((aa, aidx) => aidx === ai ? { ...aa, quantity: Number(e.target.value) } : aa) } : p))} className="mt-1 block w-full border rounded px-2 py-1" />
                          </div>
                          <div className="text-right">
                            <button type="button" onClick={() => removeAllocation(i, ai)} className="px-2 py-1 bg-red-500 text-white rounded">Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error && <div className="text-red-600">{error}</div>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-500 text-white rounded">Save</button>
            <a href={`/accounts/${initial_data.id}`} className="px-4 py-2 border rounded">Cancel</a>
          </div>
        </form>
      </div>
    </div>
  );
}
