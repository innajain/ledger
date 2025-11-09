'use client';

import Link from 'next/link';
import { format_indian_currency } from '@/utils/format_currency';
import { asset, purpose_bucket } from '@/generated/prisma/wasm';
import { Decimal } from 'decimal.js';

type BucketItem = purpose_bucket & {
  asset_balances: (asset & {
    balance: number;
    monetary_value: number | null | undefined;
    price: { price: number; date: Date } | null | undefined;
  })[];
  monetary_value: number;
};

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
            <Link href="/purpose_buckets/asset_reallocations/create" className="px-4 py-2 bg-emerald-500 text-white rounded-lg shadow-sm">
              Create Reallocation
            </Link>
          </div>
        </div>
        <div className="mb-4 text-right text-gray-700 font-medium">
          Total: {format_indian_currency(initial_data.reduce((sum, bucket) => sum.plus(bucket.monetary_value), new Decimal(0)).toNumber())}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
          {initial_data.map(bucket => (
            <Link
              key={bucket.id}
              href={`/purpose_buckets/${bucket.id}`}
              className="block bg-white rounded-xl p-4 shadow border border-gray-100 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{bucket.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{format_indian_currency(bucket.monetary_value)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
