'use client';

import Link from 'next/link';
import React from 'react';
import { formatIndianCurrency } from '@/utils/format_currency';
import { toDecimal } from '@/utils/decimal';

type AssetItem = {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  price: number | null;
  balance: number;
};

export default function ClientPage({ initial_data }: { initial_data: AssetItem[] }) {
  // group assets by type
  const groups = initial_data.reduce((map: Record<string, AssetItem[]>, a) => {
    const k = a.type || 'unknown';
    if (!map[k]) map[k] = [];
    map[k].push(a);
    return map;
  }, {} as Record<string, AssetItem[]>);

  // preferred display order for categories — modify this array to change ordering
  const preferredOrder = ['rupees', 'mf', 'etf'];
  const orderedKeys = [
    ...preferredOrder.filter(k => groups[k]),
    ...Object.keys(groups)
      .filter(k => !preferredOrder.includes(k))
      .sort(),
  ];

  const typeDisplay = (t: string) => {
    if (!t) return 'Unknown';
    // map known short types to nicer labels
    const map: Record<string, string> = { mf: 'Mutual Funds', etf: 'ETFs', rupees: 'Money' };
    return map[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Assets</h1>
          <div className="flex gap-3">
            <Link href="/assets/create" className="px-4 py-2 bg-teal-500 text-white rounded-lg shadow-sm">
              New Asset
            </Link>
          </div>
        </div>

        {orderedKeys.map(typeKey => {
          const list = groups[typeKey];
          const groupTotalDecimal = list.reduce((s, a) => s.plus(toDecimal(a.price ?? 0).times(toDecimal(a.balance))), toDecimal(0));
          const groupTotal = groupTotalDecimal;
          return (
            <section key={typeKey} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold">{typeDisplay(typeKey)}</h2>
                  <div className="ml-1">
                    <span className="inline-flex items-center text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                      {list.length} {list.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
                <div className="mb-4 text-right text-gray-700 font-medium">{groupTotal ? `₹${formatIndianCurrency(groupTotal)}` : '—'}</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {list.map(asset => (
                  <Link
                    key={asset.id}
                    href={`/assets/${asset.id}`}
                    className="block bg-white rounded-xl p-4 shadow border border-gray-100 hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="text-lg font-semibold">{asset.name}</h3>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {asset.price != null ? `₹${formatIndianCurrency(toDecimal(asset.price).times(toDecimal(asset.balance)))}` : '—'}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
