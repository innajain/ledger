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
  /** Scheduled for today (IST) or earlier — waiting to be converted to a real transaction. */
  is_due: boolean
}

export function HomeUpcomingTransactions({ transactions }: { transactions: HomeUpcomingTransaction[] }) {
  return (
    <div className="bg-paper rounded-lg shadow-sm border border-rule transition-colors flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
        <h2 className="text-lg font-semibold text-ink">Upcoming transactions</h2>
        <Link href="/transactions?future=future" className="shrink-0 text-sm font-medium text-accent hover:underline whitespace-nowrap">
          View all →
        </Link>
      </div>

      {transactions.length === 0 ? (
        <div className="px-6 pb-6">
          <p className="text-sm text-ink-3">Nothing scheduled right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-rule border-t border-rule max-h-[216px] overflow-y-auto">
          {transactions.map(tx => (
            // Same stretched-link treatment as Recent transactions: the amount needs its own
            // click-to-reveal, so it can't be nested inside the row's <Link>.
            <li key={tx.id} className="relative hover:bg-sunken transition-colors">
              <Link href={`/transactions/${tx.id}`} className="absolute inset-0 z-0" aria-label={tx.description || 'View transaction'} />
              <div className="relative z-10 pointer-events-none flex items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{tx.description || 'No description'}</p>
                  <p className="text-xs text-ink-3 flex items-center gap-1.5">
                    <LocalDateTime value={tx.date} />
                    {tx.is_due && (
                      <span className="shrink-0 font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        Due
                      </span>
                    )}
                  </p>
                </div>
                {tx.total_book !== 0 && (
                  <span className={`shrink-0 text-sm font-semibold tabular-nums pointer-events-auto ${tx.total_book > 0 ? 'text-pos' : 'text-ink'}`}>
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
