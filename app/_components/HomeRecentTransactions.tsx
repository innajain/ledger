'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { LocalDateTime } from './LocalDateTime'

export type HomeRecentTransaction = {
  id: string
  date: Date
  description: string | null
  /** Book total of the account lines — the same number the transactions list shows. */
  total_book: number
}

export function HomeRecentTransactions({ transactions }: { transactions: HomeRecentTransaction[] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent transactions</h2>
        <Link href="/transactions" className="shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
          View all →
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="px-6 pb-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nothing here yet.{' '}
            <Link href="/transactions/create" className="text-blue-600 dark:text-blue-400 hover:underline">
              Post your first transaction
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 border-t border-slate-200 dark:border-slate-700">
          {transactions.map(tx => (
            <li key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
              <Link href={`/transactions/${tx.id}`} className="flex items-center justify-between gap-3 px-6 py-3 group">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {tx.description || 'No description'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    <LocalDateTime value={tx.date} />
                  </p>
                </div>
                {tx.total_book !== 0 && (
                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      tx.total_book > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {/* a masked amount carries no sign by default, so direction must not ride on colour alone */}
                    <span aria-hidden="true">{tx.total_book > 0 ? '▲ ' : '▼ '}</span>
                    <span className="sr-only">{tx.total_book > 0 ? 'Money in, ' : 'Money out, '}</span>
                    <MaskedAmount value={tx.total_book} interactive={false} keep_sign />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
