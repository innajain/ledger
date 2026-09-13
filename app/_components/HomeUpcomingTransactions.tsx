'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { LocalDateTime } from './LocalDateTime'

export type HomeUpcomingTransaction = {
  id: string
  date: Date
  description: string | null
  /** Book total of the account lines — the same number the transactions list shows. */
  total_book: number
}

export function HomeUpcomingTransactions({ transactions }: { transactions: HomeUpcomingTransaction[] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Upcoming transactions</h2>
        <Link
          href="/transactions?future=future"
          className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
        >
          View all →
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="px-6 pb-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing scheduled right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 border-t border-slate-200 dark:border-slate-700 max-h-[216px] overflow-y-auto">
          {transactions.map(tx => (
            // Same stretched-link treatment as Recent transactions: the amount needs its own
            // click-to-reveal, so it can't be nested inside the row's <Link>.
            <li key={tx.id} className="relative hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <Link href={`/transactions/${tx.id}`} className="absolute inset-0 z-0" aria-label={tx.description || 'View transaction'} />
              <div className="relative z-10 pointer-events-none flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{tx.description || 'No description'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <LocalDateTime value={tx.date} />
                  </p>
                </div>
                {tx.total_book !== 0 && (
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums pointer-events-auto ${
                      tx.total_book > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    <MaskedAmount value={tx.total_book} keep_sign />
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
