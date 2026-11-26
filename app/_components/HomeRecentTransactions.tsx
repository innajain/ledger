'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { MaskedAmount } from './MaskedAmount'
import { HomeSectionHead, HOME_ROW } from './HomeSection'
import { USER_TIMEZONE } from '@/lib/config'
import { format_time } from '@/app/_utils/format_date'

export type HomeRecentTransaction = {
  id: string
  date: Date
  description: string | null
  /** Book total of the account lines — the same number the transactions list shows. */
  total_book: number
  tags: string[]
}

// Formatted in the ledger's own timezone so server and client render the same day.
const day_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: USER_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' })

/** The latest few transactions, grouped under each day with the day's net flow. */
export function HomeRecentTransactions({ transactions }: { transactions: HomeRecentTransaction[] }) {
  const days: { label: string; txs: HomeRecentTransaction[] }[] = []
  for (const tx of transactions) {
    const label = day_fmt.format(new Date(tx.date))
    const last = days[days.length - 1]
    if (last && last.label === label) last.txs.push(tx)
    else days.push({ label, txs: [tx] })
  }

  return (
    <section>
      <HomeSectionHead title="Recent transactions" href="/transactions" linkLabel="All transactions" />
      {transactions.length === 0 ? (
        <p className="py-3 text-sm text-ink-3">No transactions yet.</p>
      ) : (
        // Scrolls in its own box like Upcoming and Requests; the -mx-2/px-2 pair leaves room
        // for HOME_ROW's hover bleed so the box never scrolls sideways. Day headings stick to
        // the top while their rows scroll under, since each row shows only its time.
        <ul className="-mx-2 max-h-[360px] overflow-y-auto px-2">
          {days.map(day => (
            <Fragment key={day.label}>
              <li className="sticky top-0 z-20 bg-paper pt-4 pb-1.5 border-b border-rule-strong flex items-baseline justify-between gap-4 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
                <span>{day.label}</span>
                <MaskedAmount value={day.txs.reduce((s, t) => s + t.total_book, 0)} keep_sign interactive={false} className="tracking-normal" />
              </li>
              {day.txs.map(tx => (
                <li key={tx.id} className={HOME_ROW}>
                  <Link href={`/transactions/${tx.id}`} className="absolute inset-0 z-0" aria-label={tx.description || 'View transaction'} />
                  <div className="relative z-10 pointer-events-none flex items-baseline justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{tx.description || 'No description'}</p>
                      <p className="text-xs text-ink-3 mt-0.5 truncate">
                        {format_time(tx.date)}
                        {tx.tags.length > 0 && ` · ${tx.tags.join(', ')}`}
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
            </Fragment>
          ))}
        </ul>
      )}
    </section>
  )
}
