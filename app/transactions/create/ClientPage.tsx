'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { asset_type } from '@/generated/prisma/enums';
import { create_transaction } from '@/app/_actions/transactions';

export default function ClientPage({
  accounts,
  assets,
}: {
  accounts: { id: string; name: string; type: string }[];
  assets: { id: string; name: string; type: asset_type }[];
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<Array<{ account_id: string; asset_id: string; quantity: string; book_value: string; description: string }>>([
    { account_id: accounts[0]?.id ?? '', asset_id: assets[0]?.id ?? '', quantity: '0', book_value: '', description: '' },
  ]);
  const [busy, setBusy] = useState(false);

  // Nicely formatted preview of the entered date
  const formattedDate = (() => {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;

      const day = d.getDate();
      const ordinal = (n: number) => {
        const j = n % 10;
        const k = n % 100;
        if (k >= 11 && k <= 13) return n + 'th';
        if (j === 1) return n + 'st';
        if (j === 2) return n + 'nd';
        if (j === 3) return n + 'rd';
        return n + 'th';
      };

      const month = d.toLocaleString('en-US', { month: 'long' });
      const year = d.getFullYear();
      const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      return `${ordinal(day)} ${month} ${year}, ${time}`;
    } catch {
      return null;
    }
  })();

  function addItem() {
    setItems(prev => [...prev, { account_id: accounts[0]?.id ?? '', asset_id: assets[0]?.id ?? '', quantity: '0', book_value: '', description: '' }]);
  }

  function addItemForType(typeKey: string) {
    const defaultAcc = accounts.find(a => a.type === typeKey) ?? accounts[0];
    setItems(prev => [...prev, { account_id: defaultAcc?.id ?? '', asset_id: assets[0]?.id ?? '', quantity: '0', book_value: '', description: '' }]);
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const line_items = items.map(it => ({
        account_id: it.account_id,
        asset_id: it.asset_id,
        quantity: Number(it.quantity),
        book_value: it.book_value === '' ? null : Number(it.book_value),
        description: it.description === '' ? null : it.description,
      }));
      await create_transaction(new Date(date), line_items, description || null);
      window.location.href = '/transactions';
    } catch (err: any) {
      alert('Failed: ' + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  // Group items by account type
  const groups: Record<string, any[]> = { real: [], allocation: [], nominal: [] };
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const acc = accounts.find(a => a.id === it.account_id);
    const t = acc?.type ?? 'real';
    groups[t] = groups[t] || [];
    groups[t].push({ item: it, idx });
  }

  const accountTypeConfig = {
    real: {
      title: 'Real Accounts',
      color: 'green',
    },
    allocation: {
      title: 'Allocation Accounts',
      color: 'orange',
    },
    nominal: {
      title: 'Nominal Accounts',
      color: 'purple',
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/transactions" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors font-medium mb-4">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Transactions
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Create Transaction</h1>
        <p className="text-slate-600 mt-1">Add a new transaction with line items</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Basic Info Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Transaction Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date & Time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {formattedDate && <div className="text-sm text-slate-600 mt-2 italic">{formattedDate}</div>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Enter transaction description"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Line Items</h2>
          </div>

          {(['real', 'allocation', 'nominal'] as const).map(typeKey => {
            const list = groups[typeKey] || [];

            const config = accountTypeConfig[typeKey];
            const colorClasses = {
              green: 'bg-green-50 border-green-200 text-green-900',
              orange: 'bg-orange-50 border-orange-200 text-orange-900',
              purple: 'bg-purple-50 border-purple-200 text-purple-900',
            };

            return (
              <div key={typeKey} className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                <div className={`px-6 py-3 border-b ${colorClasses[config.color as keyof typeof colorClasses]}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{config.title}</h3>
                    <button
                      type="button"
                      onClick={() => addItemForType(typeKey)}
                      className="inline-flex items-center gap-2 px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add
                    </button>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {list.length === 0 && <div className="text-sm text-slate-500 italic">No items in this section. Use Add to create one.</div>}
                  {list.length > 0 &&
                    list.map(({ item: it, idx }) => {
                      const asset = assets.find(a => a.id === it.asset_id);
                      return (
                        <div key={idx} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Account</label>
                              <select
                                value={it.account_id}
                                onChange={e =>
                                  setItems(prev => {
                                    const copy = [...prev];
                                    copy[idx].account_id = e.target.value;
                                    return copy;
                                  })
                                }
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                {accounts
                                  .filter(a => a.type === typeKey)
                                  .map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.name}
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Asset</label>
                              <select
                                value={it.asset_id}
                                onChange={e =>
                                  setItems(prev => {
                                    const copy = [...prev];
                                    copy[idx].asset_id = e.target.value;
                                    const sel = assets.find(a => a.id === e.target.value);
                                    if (sel?.type === asset_type.rupees) copy[idx].book_value = '';
                                    return copy;
                                  })
                                }
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              >
                                {assets.map(a => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.type})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Quantity</label>
                              <input
                                type="number"
                                step="any"
                                value={it.quantity}
                                onChange={e =>
                                  setItems(prev => {
                                    const copy = [...prev];
                                    copy[idx].quantity = e.target.value;
                                    return copy;
                                  })
                                }
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>

                            {!(asset?.type === asset_type.rupees) && (
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Book Value</label>
                                <input
                                  type="number"
                                  step="any"
                                  placeholder="Book value"
                                  value={it.book_value}
                                  onChange={e =>
                                    setItems(prev => {
                                      const copy = [...prev];
                                      copy[idx].book_value = e.target.value;
                                      return copy;
                                    })
                                  }
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Line Item Description</label>
                              <input
                                type="text"
                                value={it.description}
                                onChange={e =>
                                  setItems(prev => {
                                    const copy = [...prev];
                                    copy[idx].description = e.target.value;
                                    return copy;
                                  })
                                }
                                placeholder="Optional description for this line item"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
          <Link href="/transactions" className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {busy ? 'Creating...' : 'Create Transaction'}
          </button>
        </div>
      </form>
    </div>
  );
}
