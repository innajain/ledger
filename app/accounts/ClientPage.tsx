"use client";

import Link from 'next/link';
import React from 'react';

import { formatIndianCurrency } from '@/utils/format_currency';

type OpeningBalance = { id: string; asset_id: string; asset_name: string; quantity: number };
type AccountItem = { id: string; name: string; opening_balances: OpeningBalance[]; total_monetary_value?: number };

export default function ClientPage({ initial_data, overall_total }: { initial_data: AccountItem[]; overall_total?: number }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Accounts</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/accounts/create" className="px-4 py-2 bg-orange-500 text-white rounded-lg shadow-sm">
              New Account
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initial_data.map(acc => (
            <Link key={acc.id} href={`/accounts/${acc.id}`} className="block bg-white p-4 rounded-xl shadow border border-gray-100 hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{acc.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">₹{formatIndianCurrency(acc.total_monetary_value ?? 0)}</div>
                </div>
              </div>

              {/* total only: per-asset opening balances hidden on list */}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
