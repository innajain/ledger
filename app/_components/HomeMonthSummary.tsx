'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'

export type HomeMonthData = {
  /** Money out this month, as a positive number. */
  spend: number
  /** Money in this month, as a positive number. */
  income: number
  categories: { head_id: string; head_name: string; amount: number }[]
  /** e.g. "1–23 Aug" */
  label: string
}

export function HomeMonthSummary({ month }: { month: HomeMonthData }) {
  const empty = month.spend === 0 && month.income === 0 && month.categories.length === 0
  const biggest = month.categories.length > 0 ? month.categories[0].amount : 0

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">This month</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{month.label}</p>
        </div>
        <Link
          href="/heads/income_expense"
          className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          Details →
        </Link>
      </div>

      {empty ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nothing booked to an income or expense category yet this month.</p>
      ) : (
        month.categories.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Top spending</p>
            <ul className="space-y-1.5">
              {month.categories.map(c => (
                <li key={c.head_id} className="relative rounded-md overflow-hidden bg-slate-50 dark:bg-slate-700/30">
                  <div
                    className="absolute inset-y-0 left-0 bg-blue-100 dark:bg-blue-900/40"
                    style={{ width: `${biggest > 0 ? Math.max((c.amount / biggest) * 100, 4) : 0}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5">
                    <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{c.head_name}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 shrink-0">
                      <MaskedAmount value={-c.amount} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      )}
    </div>
  )
}
