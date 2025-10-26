"use client";

import Link from 'next/link';
import React from 'react';
import { formatIndianCurrency } from '@/utils/format_currency';

type AssetItem = {
  id: string;
  name: string;
  type: string;
  code?: string | null;
  price: number | null;
  balance: number;
};

export default function ClientPage({ initial_data }: { initial_data: AssetItem[] }) {
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {initial_data.map(asset => (
            <Link key={asset.id} href={`/assets/${asset.id}`} className="block bg-white rounded-xl p-4 shadow border border-gray-100 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{asset.name}</h3>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{asset.price ? `₹${formatIndianCurrency(asset.price * asset.balance)}` : '—'}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
