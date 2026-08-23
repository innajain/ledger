'use client'

import Link from 'next/link'

const secondaryClasses =
  'flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group'

export function HomeQuickActions({ requestCount }: { requestCount: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Link
        href="/transactions/create"
        className="sm:col-span-2 flex items-center gap-4 p-5 rounded-lg bg-blue-600 dark:bg-blue-500 text-white shadow-sm hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors group"
      >
        <div className="shrink-0 w-11 h-11 rounded-lg bg-white/20 flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-base sm:text-lg font-semibold">New transaction</p>
          <p className="text-sm text-blue-100">Post an entry to the ledger</p>
        </div>
      </Link>

      <Link href="/reconcile" className={secondaryClasses}>
        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
            />
          </svg>
        </div>
        <span className="font-medium text-slate-900 dark:text-slate-100">Reconcile a statement</span>
      </Link>

      <Link href="/requests" className={secondaryClasses}>
        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
        <span className="font-medium text-slate-900 dark:text-slate-100">Requests</span>
        {requestCount > 0 && (
          <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-red-600 text-white">
            {requestCount}
          </span>
        )}
      </Link>
    </div>
  )
}
