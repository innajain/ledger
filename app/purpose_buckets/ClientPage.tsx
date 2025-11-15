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

export default function ClientPage({ purpose_buckets_with_balances }: { purpose_buckets_with_balances: BucketItem[] }) {
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
          Total:{' '}
          {format_indian_currency(purpose_buckets_with_balances.reduce((sum, bucket) => sum.plus(bucket.monetary_value), new Decimal(0)).toNumber())}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
          {purpose_buckets_with_balances.map(bucket => {
            const negativeAssets = bucket.asset_balances.filter(a => Number(a.balance) < 0);
            const hasNegative = negativeAssets.length > 0;

            return (
              <Link
                key={bucket.id}
                href={`/purpose_buckets/${bucket.id}`}
                className={`block bg-white rounded-xl p-4 shadow border hover:shadow-md transition ${
                  hasNegative ? 'border-red-200 bg-red-50/30' : 'border-gray-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {bucket.name}
                      {hasNegative && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                          {negativeAssets.length} negative
                        </span>
                      )}
                    </h3>

                    {/* Brief negative assets info */}
                    {hasNegative && (
                      <div className="mt-2 space-y-1 text-xs text-red-700">
                        {negativeAssets.slice(0, 3).map(a => (
                          <div key={a.id} className="flex items-center gap-2">
                            <span className="font-medium">{a.name}</span>
                            <span className="text-red-600">{format_indian_currency(a.balance)}</span>
                          </div>
                        ))}
                        {negativeAssets.length > 3 && (
                          <div className="text-xs text-red-600">+{negativeAssets.length - 3} more</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold">{format_indian_currency(bucket.monetary_value)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
