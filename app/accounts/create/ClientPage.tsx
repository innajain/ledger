'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { create_account } from '@/server actions/account/create';
import { get_indian_date_from_date_obj } from '@/utils/date';

type AssetRef = { id: string; name: string };
type BucketRef = { id: string; name: string };

export default function ClientPage({ assets, purpose_buckets }: { assets: AssetRef[]; purpose_buckets: BucketRef[] }) {
  const [name, setName] = useState('');
  const [openingBalances, setOpeningBalances] = useState<
    {
      asset_id: string;
      quantity: number;
      date: string;
      allocation_to_purpose_buckets: { purpose_bucket_id: string; quantity: number }[];
    }[]
  >([]);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function addOpeningBalance() {
    setOpeningBalances(s => [
      ...s,
      { asset_id: assets[0]?.id || '', quantity: 0, date: get_indian_date_from_date_obj(new Date()), allocation_to_purpose_buckets: [] },
    ]);
  }

  function updateOpeningBalance(idx: number, patch: Partial<(typeof openingBalances)[number]>) {
    setOpeningBalances(s => s.map((ob, i) => (i === idx ? { ...ob, ...patch } : ob)));
  }

  function addAllocation(idx: number) {
    setOpeningBalances(s =>
      s.map((ob, i) =>
        i === idx
          ? {
              ...ob,
              allocation_to_purpose_buckets: [...ob.allocation_to_purpose_buckets, { purpose_bucket_id: purpose_buckets[0]?.id || '', quantity: 0 }],
            }
          : ob
      )
    );
  }

  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const res = await create_account({ name, opening_balances: openingBalances });
      const id = res?.id;
      if (id) {
        router.push(`/accounts/${id}`);
        return;
      }
      setSuccess('Account created');
      setName('');
      setOpeningBalances([]);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl p-6 shadow">
        <h1 className="text-2xl font-bold mb-4">Create Account</h1>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Opening Balances</label>
              <button type="button" onClick={addOpeningBalance} className="text-sm px-2 py-1 bg-orange-100 rounded">
                Add
              </button>
            </div>

            <div className="space-y-3">
              {openingBalances.map((ob, idx) => (
                <div key={idx} className="p-3 border rounded">
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={ob.asset_id}
                      onChange={e => updateOpeningBalance(idx, { asset_id: e.target.value })}
                      className="border rounded px-2 py-1"
                    >
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={String(ob.quantity)}
                      onChange={e => updateOpeningBalance(idx, { quantity: Number(e.target.value) })}
                      className="border rounded px-2 py-1"
                    />
                    <input
                      placeholder="dd-MM-yyyy"
                      value={ob.date || ''}
                      onChange={e => updateOpeningBalance(idx, { date: e.target.value })}
                      className="border rounded px-2 py-1"
                    />
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-sm font-medium">Allocations</div>
                      <button type="button" onClick={() => addAllocation(idx)} className="text-xs px-2 py-1 bg-gray-100 rounded">
                        Add
                      </button>
                    </div>
                    <div className="space-y-2">
                      {ob.allocation_to_purpose_buckets.map((apb, j) => (
                        <div key={j} className="flex gap-2">
                          <select
                            value={apb.purpose_bucket_id}
                            onChange={e =>
                              updateOpeningBalance(idx, {
                                allocation_to_purpose_buckets: ob.allocation_to_purpose_buckets.map((x, ii) =>
                                  ii === j ? { ...x, purpose_bucket_id: e.target.value } : x
                                ),
                              })
                            }
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
                            onChange={e =>
                              updateOpeningBalance(idx, {
                                allocation_to_purpose_buckets: ob.allocation_to_purpose_buckets.map((x, ii) =>
                                  ii === j ? { ...x, quantity: Number(e.target.value) } : x
                                ),
                              })
                            }
                            className="border rounded px-2 py-1"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-red-600">{error}</div>}
          {success && <div className="text-green-600">{success}</div>}

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-orange-500 text-white rounded">
              Create
            </button>
            <a href="/accounts" className="px-4 py-2 border rounded">
              Cancel
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
