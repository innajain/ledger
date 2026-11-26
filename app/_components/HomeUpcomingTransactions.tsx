'use client'

import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { LocalDateTime } from './LocalDateTime'
import { HomeSectionHead, HOME_ROW, HOME_TAG } from './HomeSection'

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
    <section>
      <HomeSectionHead title="Upcoming" href="/transactions?future=future" />

      {transactions.length === 0 ? (
        <p className="py-3 text-sm text-ink-3">Nothing scheduled.</p>
      ) : (
        <ul className="-mx-2 max-h-[232px] overflow-y-auto px-2">
          {transactions.map(tx => (
            // Stretched link: the amount needs its own click-to-reveal, so it can't be
            // nested inside the row's <Link>.
            <li key={tx.id} className={HOME_ROW}>
              <Link href={`/transactions/${tx.id}`} className="absolute inset-0 z-0" aria-label={tx.description || 'View transaction'} />
              <div className="relative z-10 pointer-events-none flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate flex items-center gap-2">
                    <span className="truncate">{tx.description || 'No description'}</span>
                    {tx.is_due && <span className={`${HOME_TAG} text-warn border-warn/40`}>Due</span>}
                  </p>
                  <p className="text-xs text-ink-3 mt-0.5">
                    <LocalDateTime value={tx.date} />
                  </p>
                </div>
                {tx.total_book !== 0 && (
                  <span className={`shrink-0 text-sm pointer-events-auto ${tx.total_book > 0 ? 'text-pos' : 'text-ink'}`}>
                    <MaskedAmount value={tx.total_book} keep_sign />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
