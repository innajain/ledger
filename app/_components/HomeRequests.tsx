'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { LocalDateTime } from './LocalDateTime'

export type HomeRequest = {
  link_id: string
  status: 'pending' | 'rejected'
  kind: 'change' | 'deletion'
  other_username: string
  description: string | null
  datetime: string | null
  /** Net rupee movement on the lines that touch the viewer's linked account. */
  amount: number
}

export function HomeRequests({ requests }: { requests: HomeRequest[] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Requests</h2>
          {requests.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-red-600 text-white">
              {requests.length}
            </span>
          )}
        </div>
        <Link href="/requests" className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
          View all →
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="px-6 pb-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing awaiting you.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 border-t border-slate-200 dark:border-slate-700 max-h-[216px] overflow-y-auto">
          {requests.map(r => (
            // Approving needs a balancing-account choice, so this only links through
            // to /requests rather than duplicating that form here.
            <li key={r.link_id} className="relative hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <Link href="/requests" className="absolute inset-0 z-0" aria-label={`Request from ${r.other_username}`} />
              <div className="relative z-10 pointer-events-none flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {r.description || 'No description'}
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">from {r.other_username}</span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    {r.datetime && <LocalDateTime value={new Date(r.datetime)} />}
                    {r.kind === 'deletion' && <span className="text-amber-600 dark:text-amber-400">deletion</span>}
                    {r.status === 'rejected' && <span className="text-red-600 dark:text-red-400">rejected</span>}
                  </p>
                </div>
                {r.amount !== 0 && (
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums pointer-events-auto ${
                      r.amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    <MaskedAmount value={r.amount} keep_sign />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
