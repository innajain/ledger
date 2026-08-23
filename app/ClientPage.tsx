'use client'

import React from 'react'
import Link from 'next/link'
import { MaskedAmount } from './_components/MaskedAmount'
import { HomeQuickActions } from './_components/HomeQuickActions'
import { HomeTemplateChips, type HomeTemplate } from './_components/HomeTemplateChips'
import { HomeMonthSummary, type HomeMonthData } from './_components/HomeMonthSummary'
import { HomeRecentTransactions, type HomeRecentTransaction } from './_components/HomeRecentTransactions'

export default function ClientPage({
  welcomeMessage,
  loggedIn = false,
  invest,
  investXirrSlot,
  savings,
  networth,
  networthTrendSlot,
  month = null,
  recent = [],
  templates = [],
  requestCount = 0,
}: {
  welcomeMessage: string
  loggedIn?: boolean
  invest: { id: string; name: string; total: number } | null
  investXirrSlot?: React.ReactNode
  savings: { id: string; name: string; total: number } | null
  networth: number | null
  networthTrendSlot?: React.ReactNode
  month?: HomeMonthData | null
  recent?: HomeRecentTransaction[]
  templates?: HomeTemplate[]
  requestCount?: number
}) {
  return (
    <div className="space-y-6">
      {/* Every other route gets its h1 from PageHeader; this one has no visible title, so the
          outline would otherwise start at h2. Rendered outside the hero, which logged-out
          visitors never see. */}
      <h1 className="sr-only">Dashboard</h1>

      {/* The quip — kept, just no longer the biggest thing on the page. */}
      <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">{welcomeMessage}</p>

      {/* Hero: the number people open this page for. */}
      {networth !== null && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Net Worth</p>
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

      {/* The actual daily actions (the navbar already covers navigation). */}
      {loggedIn && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <HomeQuickActions requestCount={requestCount} />
          <HomeTemplateChips templates={templates} />
        </div>
      )}

      {/* How am I doing this month, and what did I just post? */}
      {loggedIn && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {month && <HomeMonthSummary month={month} />}
          <HomeRecentTransactions transactions={recent} />
        </div>
      )}

      {/* Allocation roll-ups. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Investments */}
        {(() => {
          const cardClass =
            'block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40'
          const inner = (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg aria-hidden="true" className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                {investXirrSlot}
              </div>
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Investment Allocation</h2>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {invest ? <MaskedAmount value={invest.total} interactive={false} /> : '—'}
              </p>
              {invest && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{invest.name}</p>}
            </>
          )
          return invest ? (
            <Link href={`/heads/allocation/${invest.id}`} className={cardClass}>
              {inner}
            </Link>
          ) : (
            <div className={cardClass}>{inner}</div>
          )
        })()}

        {/* Savings */}
        {(() => {
          const cardClass =
            'block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40'
          const inner = (
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
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Savings Allocation</h2>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {savings ? <MaskedAmount value={savings.total} interactive={false} /> : '—'}
              </p>
              {savings && <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{savings.name}</p>}
            </>
          )
          return savings ? (
            <Link href={`/heads/allocation/${savings.id}`} className={cardClass}>
              {inner}
            </Link>
          ) : (
            <div className={cardClass}>{inner}</div>
          )
        })()}
      </div>
    </div>
  )
}
