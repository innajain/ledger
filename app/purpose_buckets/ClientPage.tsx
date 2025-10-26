"use client";

import Link from 'next/link';
import React from 'react';
import { formatIndianCurrency } from '@/utils/format_currency';

type BucketItem = { id: string; name: string; total_monetary_value?: number };

export default function ClientPage({ initial_data }: { initial_data: BucketItem[] }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-yellow-50 to-amber-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Purpose Buckets</h1>
          <div className="flex gap-3">
            <Link href="/purpose_buckets/create" className="px-4 py-2 bg-amber-500 text-white rounded-lg shadow-sm">
              New Purpose Bucket
            </Link>
          </div>
        </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
          {initial_data.map(bucket => (
            <Link key={bucket.id} href={`/purpose_buckets/${bucket.id}`} className="block bg-white rounded-xl p-4 shadow border border-gray-100 hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{bucket.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">₹{formatIndianCurrency(bucket.total_monetary_value ?? 0)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
