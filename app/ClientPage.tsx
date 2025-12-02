"use client";

import React, { useState } from 'react';
import Link from 'next/link';

export default function ClientPage({ allocations = [], currencyLocale = 'en-IN', currency = 'INR', flushRedis, logOut }: { allocations?: { id: string; name: string; total: number }[]; currencyLocale?: string; currency?: string; flushRedis?: () => Promise<any>; logOut?: () => Promise<any> }) {
  const [busy, setBusy] = useState(false);
  const [busyLogout, setBusyLogout] = useState(false);
  const fmt = new Intl.NumberFormat(currencyLocale, { style: 'currency', currency, maximumFractionDigits: 2 });

  // pick commonly named allocations if present
  const invest = allocations.find(a => /invest/i.test(a.name));
  const savings = allocations.find(a => /saving/i.test(a.name));

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Welcome to Ledger</h1>
        <p className="text-slate-600">Your financial overview and quick actions</p>
      </div>

      {/* Key Allocations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Investment Allocation Card */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-medium text-blue-900 mb-1">Investment Allocation</h3>
          {invest ? (
            <Link 
              href={`/allocations/${invest.id}`}
              className="text-3xl font-bold text-blue-900 hover:text-blue-700 transition-colors"
            >
              {fmt.format(invest.total)}
            </Link>
          ) : (
            <p className="text-3xl font-bold text-blue-900">—</p>
          )}
          {invest && (
            <p className="text-sm text-blue-700 mt-2">{invest.name}</p>
          )}
        </div>

        {/* Savings Allocation Card */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm border border-green-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-sm font-medium text-green-900 mb-1">Savings Allocation</h3>
          {savings ? (
            <Link 
              href={`/allocations/${savings.id}`}
              className="text-3xl font-bold text-green-900 hover:text-green-700 transition-colors"
            >
              {fmt.format(savings.total)}
            </Link>
          ) : (
            <p className="text-3xl font-bold text-green-900">—</p>
          )}
          {savings && (
            <p className="text-sm text-green-700 mt-2">{savings.name}</p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link 
            href="/assets"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="font-medium text-slate-900">Assets</span>
          </Link>

          <Link 
            href="/accounts"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <span className="font-medium text-slate-900">Accounts</span>
          </Link>

          <Link 
            href="/allocations"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <span className="font-medium text-slate-900">Allocations</span>
          </Link>

          <Link 
            href="/transactions"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="font-medium text-slate-900">Transactions</span>
          </Link>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Admin Actions</h2>
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
            className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-orange-200"
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
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-red-200"
          >
            {busyLogout ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      </div>
    </div>
  );
}