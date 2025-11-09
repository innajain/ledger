'use client';

import Link from 'next/link';
import { format_indian_currency } from '@/utils/format_currency';
import { Decimal } from 'decimal.js';
import { asset_type, Prisma } from '@/generated/prisma';

type AssetItem = Prisma.assetGetPayload<{
  include: { opening_balances: true; income_txn: true; expense_txn: true; asset_trade_credit: true; asset_trade_debit: true };
}> & {
  balance: number;
  price: number | null;
  monetary_value: number | null;
};

export function ClientPage({ assets }: { assets: AssetItem[] }) {
  // preferred display order for categories — modify this array to change ordering
  const asset_type_order: asset_type[] = ['rupees', 'mf', 'etf'];

  function format_asset_type(t: asset_type) {
    // map known short types to nicer labels
    const map: Record<string, string> = { mf: 'Mutual Funds', etf: 'ETFs', rupees: 'Money' };
    return map[t];
  }

  if (assets.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-green-50 to-emerald-50 p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">No Assets Found</h1>
          <p className="mb-6 text-gray-700">You haven't added any assets yet. Start by creating a new asset.</p>
          <Link href="/assets/create" className="px-4 py-2 bg-teal-500 text-white rounded-lg shadow-sm">
            Create Your First Asset
          </Link>
        </div>
      </div>
    );
  }

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
        <div className="mb-4 text-right text-gray-700 font-medium">
          Total: {format_indian_currency(assets.reduce((sum, acc) => sum.plus(acc.monetary_value ?? 0), new Decimal(0)).toNumber())}
        </div>

        {asset_type_order.map(type => {
          const list = assets.filter(a => a.type === type);
          const group_total = list.reduce((s, a) => s.plus(a.monetary_value ?? 0), new Decimal(0)).toNumber();
          return (
            group_total !== 0 && (
              <section key={type} className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold">{format_asset_type(type)}</h2>
                    <div className="ml-1">
                      <span className="inline-flex items-center text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                        {list.length} {list.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>
                  <div className="mb-4 text-right text-gray-700 font-medium">{format_indian_currency(group_total)}</div>
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
                          <p className="text-lg font-bold">{format_indian_currency(asset.monetary_value)}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )
          );
        })}
      </div>
    </div>
  );
}
