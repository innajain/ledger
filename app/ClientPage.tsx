'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { currency_fmt } from './_utils/currency_formatter'
import { flush_redis } from './_actions/flush'
import { log_out } from './_actions/auth'
import { validate_all_txns } from './_actions/validate_all_txns'

const WELCOME_MESSAGES = [
  "Welcome back! Your wallet misses you (but your bank doesn't). 🦘",
  "Hello! Today's forecast: 100% chance of spreadsheets. 📊",
  "Welcome to Ledger! Let's make your money do the cha-cha. 💃",
  'Hey! Time to check your finances (and maybe cry a little). 😅',
  "Welcome back, money magician! Abracadabra, where'd it go? 🪄",
  'Ready to conquer your budget? The numbers await! 🏆',
  'Ledger loaded. Time to track those coins! 🪙',
  "Your financial sidekick is here. Let's get started! 🦸‍♂️",
  'Welcome! May your balances always be positive. ➕',
  "Money talks. Ledger listens. Let's see what it says! 🗣️",
  'Back again? Your assets are happy to see you! 😃',
  "Let's make cents of your finances together. 🧩",
  "Welcome! Today's goal: less spending, more saving. 💰",
  "Ledger says: You're richer than you think! 🤑",
  'Time to check your treasure chest. 🏴‍☠️',
]

export default function ClientPage({
  invest,
  investXirr,
  savings,
  networth,
}: {
  invest: { id: string; name: string; total: number } | null
  investXirr?: number | null
  savings: { id: string; name: string; total: number } | null
  networth: number | null
}) {
  const [busy, setBusy] = useState(false)
  const [busyLogout, setBusyLogout] = useState(false)
  const [validating, setValidating] = useState(false)
  const [welcomeMessage, setWelcomeMessage] = useState(WELCOME_MESSAGES[0])

  useEffect(() => {
    // Pick a random welcome message
    const randomMessage = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
    setWelcomeMessage(randomMessage)
  }, [])

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="animate-slide-in-up">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">{welcomeMessage}</h1>
        <p className="text-slate-600 dark:text-slate-400">Your financial overview and quick actions</p>
      </div>

      {/* Net Worth */}
      {networth !== null && (
        <div className="animate-slide-in-up stagger-item bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between transition-all hover-lift">
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Net Worth</p>
            <p className="text-2xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">{currency_fmt.format(networth)}</p>
          </div>
          <div className="shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-slate-700 dark:bg-slate-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Key Allocations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Investment Allocation Card */}
        <div className="stagger-item bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-6 transition-all hover-lift">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center transition-transform hover:scale-110">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            {investXirr !== null && investXirr !== undefined && (
              <div className="flex flex-col items-end">
                <span className="text-xs text-blue-700 dark:text-blue-300 uppercase tracking-wide font-medium">XIRR</span>
                <span
                  className={`text-lg font-bold ${
                    investXirr > 0
                      ? 'text-green-700 dark:text-green-400'
                      : investXirr < 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-blue-900 dark:text-blue-100'
                  }`}
                >
                  {(investXirr * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Investment Allocation</h3>
          {invest ? (
            <Link
              href={`/allocations/${invest.id}`}
              className="text-3xl font-bold text-blue-900 dark:text-blue-100 hover:text-blue-700 dark:hover:text-blue-200 transition-colors"
            >
              {currency_fmt.format(invest.total)}
            </Link>
          ) : (
            <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">—</p>
          )}
          {invest && <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">{invest.name}</p>}
        </div>

        {/* Savings Allocation Card */}
        <div className="stagger-item bg-linear-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-xl shadow-sm border border-green-200 dark:border-green-800 p-6 transition-all hover-lift">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-green-600 dark:bg-green-500 rounded-lg flex items-center justify-center transition-transform hover:scale-110">
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
            <Link
              href={`/allocations/${savings.id}`}
              className="text-3xl font-bold text-green-900 dark:text-green-100 hover:text-green-700 dark:hover:text-green-200 transition-colors"
            >
              {currency_fmt.format(savings.total)}
            </Link>
          ) : (
            <p className="text-3xl font-bold text-green-900 dark:text-green-100">—</p>
          )}
          {savings && <p className="text-sm text-green-700 dark:text-green-300 mt-2">{savings.name}</p>}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="stagger-item bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/assets"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all hover-lift fun-button group"
          >
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-all">
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
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all hover-lift fun-button group"
          >
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-all">
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
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all hover-lift fun-button group"
          >
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-all">
              <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
            <span className="font-medium text-slate-900 dark:text-slate-100">Allocations</span>
          </Link>

          <Link
            href="/transactions"
            className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all hover-lift fun-button group"
          >
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-all">
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
      <div className="stagger-item bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Admin Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              if (!confirm('Flush Redis cache? This clears all cached prices.')) return
              setBusy(true)
              try {
                const res = await flush_redis()
                alert(res.success ? (res.message ?? 'Redis flushed') : 'Flush failed: ' + res.message)
              } catch (err: unknown) {
                alert('Flush failed: ' + (err instanceof Error ? err.message : String(err)))
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
            className="px-4 py-2 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-200 dark:hover:bg-violet-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium border border-violet-200 dark:border-violet-800 ripple hover-lift"
          >
            {busy ? 'Flushing...' : 'Flush Redis Cache'}
          </button>

          <button
            onClick={async () => {
              if (!confirm('Validate all transactions? This will check every txn.')) return
              setValidating(true)
              try {
                const res = await validate_all_txns()
                if (!res || res.length === 0) {
                  alert('All transactions are valid')
                } else {
                  const details = res.map((r: any) => `id: ${r.id} — ${r.message}`).join('\n')
                  alert(`Invalid transactions found (${res.length}):\n\n${details}`)
                  console.error(`Invalid transactions found (${res.length}):\n\n${details}`)
                }
              } catch (err: unknown) {
                alert('Validation failed: ' + (err instanceof Error ? err.message : String(err)))
              } finally {
                setValidating(false)
              }
            }}
            disabled={validating}
            className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium border border-amber-300 dark:border-amber-700 ripple hover-lift"
          >
            {validating ? 'Validating...' : 'Validate Transactions'}
          </button>

          <button
            onClick={async () => {
              if (!confirm('Log out?')) return
              setBusyLogout(true)
              try {
                await log_out()
                window.location.reload()
              } catch (err: unknown) {
                alert('Logout failed: ' + (err instanceof Error ? err.message : String(err)))
              } finally {
                setBusyLogout(false)
              }
            }}
            disabled={busyLogout}
            className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium border border-red-200 dark:border-red-800 ripple hover-lift"
          >
            {busyLogout ? 'Logging out...' : 'Logout'}
          </button>
          <button
            onClick={() => (window.location.href = '/api/dump')}
            disabled={busyLogout}
            className="px-4 py-2 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-lg hover:bg-teal-200 dark:hover:bg-teal-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium border border-teal-200 dark:border-teal-800 ripple hover-lift"
          >
            Download db dump
          </button>
        </div>
      </div>
    </div>
  )
}
