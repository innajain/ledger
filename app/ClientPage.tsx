'use client'

import React from 'react'
import { MaskedAmount } from './_components/MaskedAmount'
import { HomeAllocations, type HomeAllocation } from './_components/HomeAllocations'
import { HomeRecentTransactions, type HomeRecentTransaction } from './_components/HomeRecentTransactions'
import { HomeUpcomingTransactions, type HomeUpcomingTransaction } from './_components/HomeUpcomingTransactions'
import { HomeRequests, type HomeRequest } from './_components/HomeRequests'

export default function ClientPage({
  dateLabel,
  loggedIn = false,
  networth,
  networthTrendSlot,
  allocations = [],
  allocationExtra,
  recent = [],
  upcoming = [],
  requests = [],
}: {
  /** Today in IST, e.g. "Wednesday, 25 November 2026" — formatted on the server. */
  dateLabel: string
  loggedIn?: boolean
  networth: number | null
  networthTrendSlot?: React.ReactNode
  allocations?: HomeAllocation[]
  /** A note hung off an allocation row, keyed by head id (the Investments XIRR). */
  allocationExtra?: Record<string, React.ReactNode>
  recent?: HomeRecentTransaction[]
  upcoming?: HomeUpcomingTransaction[]
  requests?: HomeRequest[]
}) {
  return (
    <div className="space-y-10">
      {/* Every other route gets its h1 from PageHeader; this one has no visible title, so the
          outline would otherwise start at h2. */}
      <h1 className="sr-only">Home</h1>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-end pb-8 border-b border-rule">
        <div className="min-w-0">
          <p className="font-serif text-[15px] text-ink-3 mb-5">{dateLabel}</p>
          {networth !== null && (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3 mb-2">Net worth</p>
              <p className="font-serif text-5xl sm:text-6xl leading-none tracking-tight text-ink">
                <MaskedAmount value={networth} precise numeric={false} />
              </p>
            </>
          )}
        </div>
        {networthTrendSlot}
      </section>

      {loggedIn && (
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="space-y-10 min-w-0">
            {networth !== null && <HomeAllocations allocations={allocations} networth={networth} extra={allocationExtra} />}
            <HomeUpcomingTransactions transactions={upcoming} />
            <HomeRequests requests={requests} />
          </div>
          <div className="min-w-0">
            <HomeRecentTransactions transactions={recent} />
          </div>
        </div>
      )}
    </div>
  )
}
