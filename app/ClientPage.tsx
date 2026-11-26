'use client'

import React, { useState } from 'react'
import { MaskedAmount } from './_components/MaskedAmount'
import { useAmountMask, usePrivacy } from './_components/PrivacyProvider'
import { TrendMaskContext } from './_components/HomeNetWorthSparkline'
import { HomeAllocations, type HomeAllocation } from './_components/HomeAllocations'
import { HomeRecentTransactions, type HomeRecentTransaction } from './_components/HomeRecentTransactions'
import { HomeUpcomingTransactions, type HomeUpcomingTransaction } from './_components/HomeUpcomingTransactions'
import { HomeRequests, type HomeRequest } from './_components/HomeRequests'

const LABEL = 'text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3'

export default function ClientPage({
  loggedIn = false,
  networth,
  investments = null,
  investXirrSlot,
  trendSlot,
  allocations = [],
  allocationExtra,
  recent = [],
  upcoming = [],
  requests = [],
}: {
  loggedIn?: boolean
  networth: number | null
  /** The Investments subtree's value; when set it leads the page and net worth sits under it. */
  investments?: number | null
  investXirrSlot?: React.ReactNode
  /** The 90-day line of whichever figure leads. */
  trendSlot?: React.ReactNode
  allocations?: HomeAllocation[]
  /** A note hung off an allocation row, keyed by head id (the Investments XIRR). */
  allocationExtra?: Record<string, React.ReactNode>
  recent?: HomeRecentTransaction[]
  upcoming?: HomeUpcomingTransaction[]
  requests?: HomeRequest[]
}) {
  // The hero (investments, or net worth when it leads) carries one reveal that its trend
  // line shares: the hover readout and the % change show exactly when the hero does.
  const { reveal_epoch } = usePrivacy()
  const { hide } = useAmountMask()
  const lead = investments ?? networth
  const [leadOverride, setLeadOverride] = useState<{ epoch: number; hidden: boolean } | null>(null)
  const leadHidden = leadOverride !== null && leadOverride.epoch === reveal_epoch ? leadOverride.hidden : lead !== null && hide(lead)
  const leadMask = { hidden: leadHidden, on_toggle_hidden: (hidden: boolean) => setLeadOverride({ epoch: reveal_epoch, hidden }) }

  return (
    <div className="space-y-10">
      {/* Every other route gets its h1 from PageHeader; this one has no visible title, so the
          outline would otherwise start at h2. */}
      <h1 className="sr-only">Home</h1>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-end pb-8 border-b border-rule">
        <div className="min-w-0">
          {investments !== null ? (
            <>
              <div className="flex items-baseline mb-2">
                <p className={LABEL}>Investments</p>
                {investXirrSlot}
              </div>
              <p className="font-serif text-5xl sm:text-6xl leading-none tracking-tight text-ink">
                <MaskedAmount value={investments} plain numeric={false} {...leadMask} />
              </p>
              {networth !== null && (
                <>
                  <p className={`${LABEL} mt-6 mb-1.5`}>Net worth</p>
                  <p className="font-serif text-2xl sm:text-3xl leading-none tracking-tight text-ink-2">
                    <MaskedAmount value={networth} plain numeric={false} />
                  </p>
                </>
              )}
            </>
          ) : (
            networth !== null && (
              <>
                <p className={`${LABEL} mb-2`}>Net worth</p>
                <p className="font-serif text-5xl sm:text-6xl leading-none tracking-tight text-ink">
                  <MaskedAmount value={networth} plain numeric={false} {...leadMask} />
                </p>
              </>
            )
          )}
        </div>
        <TrendMaskContext.Provider value={leadHidden}>{trendSlot}</TrendMaskContext.Provider>
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
