"use client";

import Link from 'next/link';
import React from 'react';
import { formatIndianCurrency } from '@/utils/format_currency';

type TxnItem = { id: string; type: string | null; description: string; asset_name?: string | null; account_name?: string | null; quantity?: number | null; value?: number | null; date?: string | null };

export default function ClientPage({ initial_data }: { initial_data: TxnItem[] }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <div className="flex gap-3">
            <Link href="/transactions/create" className="px-4 py-2 bg-rose-500 text-white rounded-lg shadow-sm">
              New Transaction
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          {initial_data.map(tx => {
            const dateDisplay = tx.date ? new Date(tx.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) : null;
            return (
              <Link key={tx.id} href={`/transactions/${tx.id}`} className="block bg-white p-4 rounded-xl shadow border border-gray-100 hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">{(tx.type ?? 'unknown').toUpperCase()}</span>

                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <div className="font-medium truncate">{tx.description || <span className="text-gray-400">(no description)</span>}</div>

                        <div className="text-sm text-gray-600 flex items-center gap-2 shrink-0">
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
                    <div className="ml-4 shrink-0 text-right text-sm text-gray-500">{dateDisplay}</div>
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