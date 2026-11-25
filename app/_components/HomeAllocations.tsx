'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { MaskedAmount } from './MaskedAmount'
import { HomeSectionHead } from './HomeSection'

export type HomeAllocation = { id: string; name: string; total: number }

/**
 * The top-level allocations as an accounting table: one line per bucket with its share of
 * net worth, closed by a double-ruled total. `extra` hangs a note off a named row (the
 * Investments XIRR).
 */
export function HomeAllocations({
  allocations,
  networth,
  extra,
}: {
  allocations: HomeAllocation[]
  networth: number
  extra?: Record<string, ReactNode>
}) {
  return (
    <section>
      <HomeSectionHead title="Allocations" href="/heads/allocation" linkLabel="All allocations" />
      {allocations.length === 0 ? (
        <p className="py-3 text-sm text-ink-3">No allocations yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
              <th className="text-left font-medium py-2">Bucket</th>
              <th className="text-right font-medium py-2">Balance</th>
              <th className="w-20 sm:w-24 font-medium py-2 pl-4 text-left">Share</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map(a => {
              // A share bar only means something for a positive slice of a positive whole,
              // so an overspent bucket gets none.
              const share = networth > 0 && a.total > 0 ? Math.min(1, a.total / networth) : null
              return (
                <tr key={a.id} className="border-t border-rule hover:bg-sunken transition-colors">
                  <td className="py-2.5 pr-3">
                    <Link href={`/heads/allocation/${a.id}`} className="text-ink hover:text-accent">
                      {a.name}
                    </Link>
                    {extra?.[a.id]}
                  </td>
                  {/* No neg colour: MaskedAmount hides the sign while masked, and a red figure
                      would give it straight back. */}
                  <td className="py-2.5 text-right whitespace-nowrap text-ink">
                    <MaskedAmount value={a.total} precise />
                  </td>
                  <td className="py-2.5 pl-4">
                    {share !== null && (
                      <div className="h-1 bg-rule" aria-label={`${Math.round(share * 100)}% of net worth`}>
                        <div className="h-full bg-ink-2" style={{ width: `${Math.max(2, share * 100)}%` }} />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-rule-strong border-b-[3px] border-b-rule-strong border-double font-medium">
              <td className="py-2.5">Total</td>
              <td className="py-2.5 text-right whitespace-nowrap">
                <MaskedAmount value={networth} precise />
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}
