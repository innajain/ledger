'use client'

import Link from 'next/link'
import { SectionHeading } from './SectionHeading'
import type { InactiveAccount, InactiveAsset } from './types'

const TYPE_LABELS: Record<string, string> = {
  account: 'Account',
  allocation: 'Allocation',
  income_expense: 'Income/Expense',
}

// The path segment is the head type verbatim: /heads/{account|allocation|income_expense}
const accountUrl = (a: InactiveAccount) => `/heads/${a.type}/${a.id}`

export function DataSection({ inactiveAccounts, inactiveAssets }: { inactiveAccounts: InactiveAccount[]; inactiveAssets: InactiveAsset[] }) {
  return (
    <section>
      <SectionHeading id="data">Data</SectionHeading>
      <div className="space-y-6">
        {/* Inactive Accounts */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Inactive Accounts</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Accounts that are hidden from transaction selectors. Click to manage.</p>
          {inactiveAccounts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">No inactive accounts.</p>
          ) : (
            <ul className="space-y-2">
              {inactiveAccounts.map(a => (
                <li key={a.id}>
                  <Link
                    href={accountUrl(a)}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {a.name}
                      {a.is_placeholder && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(placeholder)</span>}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.type === 'account'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : a.type === 'allocation'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                      }`}
                    >
                      {TYPE_LABELS[a.type] ?? a.type}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Inactive Assets */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Inactive Assets</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">Assets that are hidden from transaction selectors. Click to manage.</p>
          {inactiveAssets.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 italic">No inactive assets.</p>
          ) : (
            <ul className="space-y-2">
              {inactiveAssets.map(a => (
                <li key={a.id}>
                  <Link
                    href={`/assets/${a.id}/update`}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {a.name}
                      {a.is_placeholder && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(placeholder)</span>}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 capitalize">
                      {a.type}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Database Dump */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Database Dump</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Download a SQL file with INSERT statements for every user-data table.</p>
            </div>
            <a
              href="/api/dump"
              className="shrink-0 px-4 py-2 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-lg hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors font-medium border border-teal-200 dark:border-teal-800 inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
