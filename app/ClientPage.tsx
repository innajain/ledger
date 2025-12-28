'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { currency_fmt } from './_utils/currency formatter';

export default function ClientPage({
  allocations = [],
  currencyLocale = 'en-IN',
  currency = 'INR',
  flushRedis,
  logOut,
}: {
  allocations?: { id: string; name: string; total: number }[];
  currencyLocale?: string;
  currency?: string;
  flushRedis?: () => Promise<any>;
  logOut?: () => Promise<any>;
}) {
  const [busy, setBusy] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);

  // pick commonly named allocations if present
  const invest = allocations.find(a => /invest/i.test(a.name));
  const savings = allocations.find(a => /saving/i.test(a.name));

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">Welcome to Ledger</h1>
        <p className="text-slate-600 dark:text-slate-400">Your financial overview and quick actions</p>
      </div>

      {/* Key Allocations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Investment Allocation Card */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-6 transition-colors">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Investment Allocation</h3>
          {invest ? (
            <Link href={`/allocations/${invest.id}`} className="text-3xl font-bold text-blue-900 dark:text-blue-100 hover:text-blue-700 dark:hover:text-blue-200 transition-colors">
              {currency_fmt.format(invest.total)}
            </Link>
          ) : (
            <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">—</p>
          )}
          {invest && <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">{invest.name}</p>}
        </div>

        {/* Savings Allocation Card */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-xl shadow-sm border border-green-200 dark:border-green-800 p-6 transition-colors">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-green-600 dark:bg-green-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">Savings Allocation</h3>
          {savings ? (
            <Link href={`/allocations/${savings.id}`} className="text-3xl font-bold text-green-900 dark:text-green-100 hover:text-green-700 dark:hover:text-green-200 transition-colors">
              {currency_fmt.format(savings.total)}
            </Link>
          ) : (
            <p className="text-3xl font-bold text-green-900 dark:text-green-100">—</p>
          )}
          {savings && <p className="text-sm text-green-700 dark:text-green-300 mt-2">{savings.name}</p>}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/assets"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
          >
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100">Assets</span>
          </Link>

          <Link
            href="/accounts"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
          >
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100">Accounts</span>
          </Link>

          <Link
            href="/allocations"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
          >
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100">Allocations</span>
          </Link>

          <Link
            href="/transactions"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
          >
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100">Transactions</span>
          </Link>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Admin Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              if (!flushRedis) return alert('Flush not available');
              if (!confirm('Flush Redis cache? This clears all cached prices.')) return;
              setBusy(true);
              try {
                const res = await flushRedis();
                alert(res?.ok ? 'Redis flushed' : 'Flush returned: ' + JSON.stringify(res));
              } catch (err: any) {
                alert('Flush failed: ' + (err?.message ?? String(err)));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-orange-200 dark:border-orange-800"
          >
            {busy ? 'Flushing...' : 'Flush Redis Cache'}
          </button>

          <button
            onClick={async () => {
              if (!logOut) return alert('Logout not available');
              if (!confirm('Log out?')) return;
              setBusyLogout(true);
              try {
                await logOut();
                window.location.reload();
              } catch (err: any) {
                alert('Logout failed: ' + (err?.message ?? String(err)));
              } finally {
                setBusyLogout(false);
              }
            }}
            disabled={busyLogout}
            className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-red-200 dark:border-red-800"
          >
            {busyLogout ? 'Logging out...' : 'Logout'}
          </button>
          <button
            onClick={() => (window.location.href = '/api/dump')}
            disabled={busyLogout}
            className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-red-200 dark:border-red-800"
          >
            Download db dump
          </button>
        </div>
      </div>
    </div>
  );
}
