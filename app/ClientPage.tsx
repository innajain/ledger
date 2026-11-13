'use client'

import React from 'react'
import Link from 'next/link'
import { MaskedAmount } from './_components/MaskedAmount'
import { HomeUpcomingTransactions, type HomeUpcomingTransaction } from './_components/HomeUpcomingTransactions'
import { HomeRequests, type HomeRequest } from './_components/HomeRequests'
import type { Spendable } from './_utils/spendable'

export default function ClientPage({
  welcomeMessage,
  loggedIn = false,
  invest,
  investXirrSlot,
  savings,
  networth,
  spendable,
  networthTrendSlot,
  upcoming = [],
  requests = [],
}: {
  welcomeMessage: string
  loggedIn?: boolean
  invest: { id: string; name: string; total: number } | null
  investXirrSlot?: React.ReactNode
  savings: { id: string; name: string; total: number } | null
  networth: number | null
  spendable: Spendable | null
  networthTrendSlot?: React.ReactNode
  upcoming?: HomeUpcomingTransaction[]
  requests?: HomeRequest[]
}) {
  return (
    <div className="space-y-6">
      {/* Every other route gets its h1 from PageHeader; this one has no visible title, so the
          outline would otherwise start at h2. Rendered outside the hero, which logged-out
          visitors never see. */}
      <h1 className="sr-only">Dashboard</h1>

      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">{welcomeMessage}</p>

      {networth !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total net worth</p>
              <p className="text-3xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100">
                <MaskedAmount value={networth} />
              </p>
            </div>
            <div className="shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-slate-700 dark:bg-slate-600 rounded-xl flex items-center justify-center">
              <svg aria-hidden="true" className="w-5 h-5 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          {networthTrendSlot}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Investments. The amount needs its own click-to-reveal, so it can't sit inside the
            card's <Link> (nesting an interactive control inside an anchor is invalid and was
            exactly what silently broke the toggle — every click hit the link, not the amount).
            Instead the Link is an invisible layer stretched behind the whole card; everything
            except the amount forwards clicks through to it via pointer-events-none, and the
            amount sits on top as the one real interactive island. */}
        {(() => {
          const content = (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg aria-hidden="true" className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                {investXirrSlot}
              </div>
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Investment allocation</h2>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {invest ? (
                  <span className="pointer-events-auto inline-block">
                    <MaskedAmount value={invest.total} />
                  </span>
                ) : (
                  '—'
                )}
              </p>
              {invest && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{invest.name}</p>}
            </>
          )
          return invest ? (
            <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
              <Link
                href={`/heads/allocation/${invest.id}`}
                aria-label={`View ${invest.name} allocation`}
                className="absolute inset-0 z-0 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
              />
              <div className="relative z-10 pointer-events-none">{content}</div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
              {content}
            </div>
          )
        })()}

        {/* Savings — same stretched-link treatment as Investments above. */}
        {(() => {
          const content = (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-green-600 dark:bg-green-500 rounded-lg flex items-center justify-center">
                  <svg aria-hidden="true" className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Savings allocation</h2>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {savings ? (
                  <span className="pointer-events-auto inline-block">
                    <MaskedAmount value={savings.total} />
                  </span>
                ) : (
                  '—'
                )}
              </p>
              {savings && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{savings.name}</p>}
            </>
          )
          return savings ? (
            <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
              <Link
                href={`/heads/allocation/${savings.id}`}
                aria-label={`View ${savings.name} allocation`}
                className="absolute inset-0 z-0 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
              />
              <div className="relative z-10 pointer-events-none">{content}</div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
              {content}
            </div>
          )
        })()}

        {/* Spendable: what is left once investments and locked-away money are taken out. It is
            net, so the breakdown is on the card rather than behind a click — the figure alone
            would read as a cash balance, which it is not. No link: there is no single head
            behind it. */}
        {spendable && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-amber-600 dark:bg-amber-500 rounded-lg flex items-center justify-center">
                <svg aria-hidden="true" className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
            </div>
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Spendable</h2>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              <MaskedAmount value={spendable.spendable} />
            </p>
            <dl className="text-sm text-slate-500 dark:text-slate-400 mt-3 space-y-1">
              <div className="flex justify-between gap-4">
                <dt>Outside investments</dt>
                <dd className="whitespace-nowrap">
                  <MaskedAmount value={spendable.outside_investments} />
                </dd>
              </div>
              {spendable.locked.map(l => (
                <div key={l.name} className="flex justify-between gap-4">
                  <dt>Less {l.name}</dt>
                  <dd className="whitespace-nowrap">
                    <MaskedAmount value={-l.total} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {loggedIn && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <HomeUpcomingTransactions transactions={upcoming} />
          <HomeRequests requests={requests} />
        </div>
      )}
    </div>
  )
}
