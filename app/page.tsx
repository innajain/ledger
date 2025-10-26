import Link from 'next/link';
import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { formatIndianCurrency } from '@/utils/format_currency';

export default async function Home() {
  // Fetch all assets with their balance entries and monetary values
  const assets = await prisma.asset.findMany({
    include: { asset_trade_credit: true, asset_trade_debit: true, expense_txn: true, income_txn: true, opening_balances: true },
  });

  const assets_with_price = await Promise.all(
    assets.map(async asset => {
      const price_data = await get_price_for_asset(asset.type, asset.code);
      return { ...asset, price: price_data?.price || null };
    })
  );
  const assets_with_available_price = assets_with_price.filter(asset => asset.price !== null);

  const assets_with_balance = assets_with_available_price.map(asset => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    code: asset.code,
    price: asset.price,
    balance:
      asset.opening_balances.reduce((sum, txn) => sum + txn.quantity, 0) +
      asset.income_txn.reduce((sum, txn) => sum + txn.quantity, 0) -
      asset.expense_txn.reduce((sum, txn) => sum + txn.quantity, 0) +
      asset.asset_trade_credit.reduce((sum, txn) => sum + txn.credit_quantity, 0) -
      asset.asset_trade_debit.reduce((sum, txn) => sum + txn.debit_quantity, 0),
  }));

  const assets_with_monetary_value = assets_with_balance.map(asset => ({ ...asset, current_monetary_value: asset.balance * asset.price! }));

  const total_monetary_value_of_all_assets = assets_with_monetary_value.reduce((sum, asset) => sum + asset.current_monetary_value, 0);

  const investment_purpose_bucket = await prisma.purpose_bucket.findUnique({
    where: { name: 'Investments' },
    include: {
      allocation_to_purpose_bucket: {
        include: { allocation_thru_income: { include: { asset: true } }, allocation_thru_account_opening: { include: { asset: true } } },
      },
      expense_txn: true,
      asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: true } },
      asset_reallocation_between_purpose_buckets_from: true,
      asset_reallocation_between_purpose_buckets_to: true,
    },
  });

  const asset_to_balance_map_for_investment = new Map<string, number>();

  investment_purpose_bucket?.allocation_to_purpose_bucket.forEach(allocation => {
    if (allocation.allocation_thru_income) {
      const asset_id = allocation.allocation_thru_income.asset_id;
      asset_to_balance_map_for_investment.set(asset_id, (asset_to_balance_map_for_investment.get(asset_id) || 0) + allocation.quantity);
    } else {
      const asset_id = allocation.allocation_thru_account_opening!.asset_id;
      asset_to_balance_map_for_investment.set(asset_id, (asset_to_balance_map_for_investment.get(asset_id) || 0) + allocation.quantity);
    }
  });

  investment_purpose_bucket?.expense_txn.forEach(txn => {
    const asset_id = txn.asset_id;
    asset_to_balance_map_for_investment.set(asset_id, (asset_to_balance_map_for_investment.get(asset_id) || 0) - txn.quantity);
  });

  investment_purpose_bucket?.asset_replacement_in_purpose_buckets.forEach(replacement => {
    const debit_asset_id = replacement.asset_trade_txn.debit_asset_id;
    const debit_quantity = replacement.debit_quantity;
    asset_to_balance_map_for_investment.set(debit_asset_id, (asset_to_balance_map_for_investment.get(debit_asset_id) || 0) - debit_quantity);

    const credit_asset_id = replacement.asset_trade_txn.credit_asset_id;
    const credit_quantity = replacement.credit_quantity;
    asset_to_balance_map_for_investment.set(credit_asset_id, (asset_to_balance_map_for_investment.get(credit_asset_id) || 0) + credit_quantity);
  });

  investment_purpose_bucket?.asset_reallocation_between_purpose_buckets_from.forEach(reallocation => {
    const asset_id = reallocation.asset_id;
    const quantity = reallocation.quantity;
    asset_to_balance_map_for_investment.set(asset_id, (asset_to_balance_map_for_investment.get(asset_id) || 0) - quantity);
  });

  investment_purpose_bucket?.asset_reallocation_between_purpose_buckets_to.forEach(reallocation => {
    const asset_id = reallocation.asset_id;
    const quantity = reallocation.quantity;
    asset_to_balance_map_for_investment.set(asset_id, (asset_to_balance_map_for_investment.get(asset_id) || 0) + quantity);
  });

  const asset_to_price_map = new Map(assets_with_price.map(asset => [asset.id, asset.price]));

  const total_investment_monetary_value = Array.from(asset_to_balance_map_for_investment.entries()).reduce((sum, [asset_id, balance]) => {
    const price = asset_to_price_map.get(asset_id) || 0;
    return sum + balance * price;
  }, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">
            Accounting Ledger
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Track your finances with precision. Manage assets, accounts, and transactions in one place.
          </p>
        </div>

        {/* Portfolio Value Cards */}
        {
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Total Portfolio */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-700">Total Assets Owned</h3>
                <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">₹{formatIndianCurrency(total_monetary_value_of_all_assets)}</p>
              <p className="text-sm text-gray-500">All assets across accounts</p>
            </div>

            {/* Investments Value */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-700">Investments</h3>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <p className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">₹{formatIndianCurrency(total_investment_monetary_value)}</p>
              <p className="text-sm text-gray-500">Investment value</p>
            </div>
          </div>
        }

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {/* Primary views */}
            <Link
              href="/accounts"
              className="group p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-100 hover:border-blue-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">Accounts</h3>
              </div>
              <p className="text-sm text-gray-600">View and manage your accounts</p>
            </Link>

            <Link
              href="/assets"
              className="group p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border-2 border-green-100 hover:border-green-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-green-600 transition-colors">Assets</h3>
              </div>
              <p className="text-sm text-gray-600">Browse your asset portfolio</p>
            </Link>

            <Link
              href="/purpose_buckets"
              className="group p-6 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border-2 border-yellow-100 hover:border-yellow-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-yellow-600 transition-colors">Purpose Buckets</h3>
              </div>
              <p className="text-sm text-gray-600">Manage and view purpose buckets</p>
            </Link>

            <Link
              href="/transactions"
              className="group p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border-2 border-purple-100 hover:border-purple-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-purple-600 transition-colors">Transactions</h3>
              </div>
              <p className="text-sm text-gray-600">Track all your transactions</p>
            </Link>

            {/* Create actions */}
            <Link
              href="/accounts/create"
              className="group p-6 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border-2 border-orange-100 hover:border-orange-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-orange-600 transition-colors">New Account</h3>
              </div>
              <p className="text-sm text-gray-600">Create a new account</p>
            </Link>

            <Link
              href="/assets/create"
              className="group p-6 bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border-2 border-teal-100 hover:border-teal-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-teal-600 transition-colors">New Asset</h3>
              </div>
              <p className="text-sm text-gray-600">Add a new asset</p>
            </Link>

            <Link
              href="/purpose_buckets/create"
              className="group p-6 bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-100 hover:border-amber-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-amber-600 transition-colors">New Purpose Bucket</h3>
              </div>
              <p className="text-sm text-gray-600">Create a new purpose bucket</p>
            </Link>

            <Link
              href="/transactions/create"
              className="group p-6 bg-gradient-to-br from-rose-50 to-red-50 rounded-xl border-2 border-rose-100 hover:border-rose-300 transition-all hover:shadow-md"
            >
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-rose-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 group-hover:text-rose-600 transition-colors">New Transaction</h3>
              </div>
              <p className="text-sm text-gray-600">Record a new transaction</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
