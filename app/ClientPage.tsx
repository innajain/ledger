'use client';

import { format_indian_currency } from '@/utils/format_currency';
import Link from 'next/link';
import FlushRedisButton from './components/FlushRedisButton';
import {Decimal} from 'decimal.js';

export function ClientPage({
  expendable_monetary_value,
  total_investment_monetary_value,
  total_emergency_monetary_value,
}: {
  expendable_monetary_value: number;
  total_investment_monetary_value: number;
  total_emergency_monetary_value: number;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-4">Ledger</h1>
        </div>

        {/* Portfolio Value Cards */}
        {
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {/* Total Portfolio */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-700">Expense Money</h3>
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
              <p className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">{format_indian_currency(expendable_monetary_value)}</p>
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
              <p className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">{format_indian_currency(total_investment_monetary_value)}</p>
            </div>

            {/* Emergency Fund Value */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-700">Emergency Fund</h3>
                <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-pink-500 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 2l7 4v5c0 5.25-3.5 9.74-7 11-3.5-1.26-7-5.75-7-11V6l7-4z"
                    />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 11.5l1.75 1.75L15 9.5" />
                  </svg>
                </div>
              </div>
              <p className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">{format_indian_currency(total_emergency_monetary_value)}</p>
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

            {/* Redis flush - admin utility (client only) */}
            <div className="p-6 rounded-xl border-2 border-gray-100 bg-red-50">
              <div className="flex items-center mb-3">
                <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22"
                    />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800">Empty Redis</h3>
              </div>
              <p className="text-sm text-gray-600 mb-3">Clear all keys from Redis (for admin/development use).</p>
              {/* client-only button */}
              <FlushRedisButton />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
