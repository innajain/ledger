'use client';

import Link from 'next/link';
import { format_indian_currency } from '@/utils/format_currency';
import { Decimal } from 'decimal.js';

type AccountItem = {
  id: string;
  name: string;
  total_monetary_value: number;
};

export default function ClientPage({ accounts }: { accounts: AccountItem[] }) {
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
        <div className="mb-4 text-right text-gray-700 font-medium">
          Total: {format_indian_currency(accounts.reduce((sum, acc) => sum.plus(acc.total_monetary_value ?? 0), new Decimal(0)).toNumber())}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map(acc => (
            <Link
              key={acc.id}
              href={`/accounts/${acc.id}`}
              className="block bg-white p-4 rounded-xl shadow border border-gray-100 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{acc.name}</h3>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{format_indian_currency(acc.total_monetary_value ?? 0)}</div>
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
