'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'

export type HomeMonthData = {
  /** Money out this month, as a positive number. */
  spend: number
  /** Money in this month, as a positive number. */
  income: number
  spend_change: number | null
  income_change: number | null
  categories: { head_id: string; head_name: string; amount: number }[]
  /** e.g. "1–23 Aug" */
  label: string
  /** The comparison stretch of last month, e.g. "1–23 Jul" */
  compare_label: string
}

function DeltaPill({ change, higher_is_good }: { change: number | null; higher_is_good: boolean }) {
  if (change === null) return <span className="text-xs text-slate-500 dark:text-slate-400">no comparison</span>
  const pct = change * 100
  const flat = Math.abs(pct) < 0.5
  const good = flat ? null : higher_is_good ? change > 0 : change < 0
  const tone = good === null ? 'text-slate-500 dark:text-slate-400' : good ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
  return <span className={`text-xs font-medium ${tone}`}>{flat ? '≈ flat' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`}</span>
}

export function HomeMonthSummary({ month }: { month: HomeMonthData }) {
  const empty = month.spend === 0 && month.income === 0 && month.categories.length === 0
  const biggest = month.categories.length > 0 ? month.categories[0].amount : 0

  return (
    <div className="stagger-item bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">This month</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {month.label} · compared with {month.compare_label}
          </p>
        </div>
        <Link
          href="/heads/income_expense"
          className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          Details →
        </Link>
      </div>

      {empty ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nothing booked to an income or expense head yet this month.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Spent</p>
              {/* negated: `spend` is a magnitude, but every other amount on this page is a signed
                  book value, so money out has to read as negative here too */}
              <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 mt-0.5">
                <MaskedAmount value={-month.spend} />
              </p>
              <div className="mt-1">
                <DeltaPill change={month.spend_change} higher_is_good={false} />
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Received</p>
              <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 mt-0.5">
                <MaskedAmount value={month.income} />
              </p>
              <div className="mt-1">
                <DeltaPill change={month.income_change} higher_is_good={true} />
              </div>
            </div>
          </div>

          {month.categories.length > 0 && (
            <div className="mt-5">
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
          )}
        </>
      )}
    </div>
  )
}
