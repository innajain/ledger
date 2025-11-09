"use client";

import Link from 'next/link';
import React, { useMemo, useState } from 'react';
import { format_indian_currency } from '@/utils/format_currency';
import {Decimal} from 'decimal.js';

type TxnItem = { id: string; type: string | null; description: string; asset_name?: string | null; account_name?: string | null; quantity?: number | null; value?: number | null; date?: string | null; purpose_names?: string | null };

export default function ClientPage({ transactions }: { transactions: TxnItem[] }) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');
  const [textQuery, setTextQuery] = useState<string>('');

  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      // type filter
      if (typeFilter !== 'all' && (tx.type ?? '') !== typeFilter) return false;

      // date range filter
      if (fromDate && tx.date) {
        const txd = new Date(tx.date);
        const fd = new Date(fromDate);
        if (txd < fd) return false;
      }
      if (toDate && tx.date) {
        const txd = new Date(tx.date);
        const td = new Date(toDate);
        // include the end date (set to end of day)
        td.setHours(23, 59, 59, 999);
        if (txd > td) return false;
      }

      // amount range — prefer monetary value, fall back to quantity
      const numericValDecimal = new Decimal(tx.value ?? tx.quantity ?? 0);
      const numericVal = Number(numericValDecimal.toFixed(8));
      if (amountMin) {
        const minN = Number(amountMin);
        if (numericVal < minN) return false;
      }
      if (amountMax) {
        const maxN = Number(amountMax);
        if (numericVal > maxN) return false;
      }

      // text search across description/asset/account/purpose buckets
      if (textQuery) {
        const q = textQuery.toLowerCase();
        const hay = `${tx.description ?? ''} ${tx.asset_name ?? ''} ${tx.account_name ?? ''} ${tx.purpose_names ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [transactions, typeFilter, fromDate, toDate, amountMin, amountMax, textQuery]);

  const types = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach(d => { if (d.type) s.add(d.type); });
    return Array.from(s);
  }, [transactions]);

  function clearFilters() {
    setTypeFilter('all');
    setFromDate('');
    setToDate('');
    setAmountMin('');
    setAmountMax('');
    setTextQuery('');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <div className="mt-3 sm:mt-0 flex w-full sm:w-auto gap-2 flex-col sm:flex-row items-stretch sm:items-center">
            <button
              type="button"
              onClick={() => setShowFilters(s => !s)}
              className="w-full sm:w-auto px-3 py-2 border rounded-lg text-sm bg-white text-center"
            >
              {showFilters ? 'Hide filters' : 'Show filters'}
            </button>
            <Link href="/transactions/create" className="w-full sm:w-auto px-3 py-2 bg-rose-500 text-white rounded-lg shadow-sm text-center text-sm">
              New Transaction
            </Link>
          </div>
        </div>

  {/* Filters (hidden by default) */}
  <div className={`${showFilters ? '' : 'hidden'} mb-4 bg-white p-3 rounded-lg border`}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-xs text-gray-600">Type</label>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                <option value="all">All</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600">From</label>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            </div>

            <div>
              <label className="block text-xs text-gray-600">To</label>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            </div>

            <div>
              <label className="block text-xs text-gray-600">Amount min / max</label>
              <div className="flex gap-2 mt-1">
                <input type="number" step="0.01" placeholder="min" value={amountMin} onChange={e => setAmountMin(e.target.value)} className="block w-1/2 border rounded px-2 py-1" />
                <input type="number" step="0.01" placeholder="max" value={amountMax} onChange={e => setAmountMax(e.target.value)} className="block w-1/2 border rounded px-2 py-1" />
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <label className="block text-xs text-gray-600">Search</label>
              <input placeholder="text in description / asset / account" value={textQuery} onChange={e => setTextQuery(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            </div>

            <div className="sm:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={clearFilters} className="px-3 py-1 border rounded">Clear</button>
              <div className="px-3 py-1 text-sm text-gray-600">Showing {filtered.length} of {transactions.length}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map(tx => {
            const dateDisplay = tx.date ? new Date(tx.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : null;
            return (
              <Link key={tx.id} href={`/transactions/${tx.id}`} className="block bg-white p-4 rounded-xl shadow border border-gray-100 hover:shadow-md transition">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{(tx.type ?? 'unknown').toUpperCase()}</span>

                      <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                        <div className="font-medium truncate">{tx.description || <span className="text-gray-400">(no description)</span>}</div>

                        <div className="text-sm text-gray-600 flex items-center gap-2 shrink flex-wrap">
                          {tx.asset_name && <span className="font-medium text-gray-800 truncate">{tx.asset_name}</span>}
                          {tx.asset_name && tx.account_name && <span className="text-gray-300">·</span>}
                          {tx.account_name && <span className="text-gray-600 truncate">{tx.account_name}</span>}
                          {(tx.quantity !== undefined && tx.quantity !== null) && (
                            <>
                              <span className="text-gray-300">·</span>
                              <span className="font-mono text-gray-800">{Number(tx.quantity).toFixed(4)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {dateDisplay && (
                    <div className="mt-2 sm:mt-0 ml-0 sm:ml-4 shrink-0 text-right text-sm text-gray-500">{dateDisplay}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}