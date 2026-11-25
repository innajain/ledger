'use client'

import Link from 'next/link'
import { asset_type } from '@/generated/prisma/enums'
import { MaskedAmount } from './MaskedAmount'
import { Card } from './Card'
import { EmptyState } from './EmptyState'
import { HoldingsEmptyIcon } from './EmptyStateIcons'

export type HoldingItem = {
  id: string
  name: string
  link: string
  asset_type?: asset_type
  quantity: number
  txn_value: number | null
  current_value: number
}

type HoldingsGridProps = {
  title: string
  items: HoldingItem[]
  emptyMessage?: string
  emptySubMessage?: string
  /** Heading of the name column, and the noun the count uses — an asset's page lists accounts. */
  nameHeader?: string
  noun?: string
}

const qty_fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

/**
 * What a head holds, as a ruled table: one line per asset with its units, book value and
 * current value. Rupees have no units or separate book value, so those cells stay empty
 * rather than repeating the balance.
 */
export function HoldingsGrid({
  title,
  items,
  emptyMessage = 'No holdings yet',
  emptySubMessage = 'Holdings will appear here once transactions are recorded',
  nameHeader = 'Asset',
  noun = 'item',
}: HoldingsGridProps) {
  return (
    <Card>
      <div className="px-4 sm:px-6 pt-5 pb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-medium text-ink">{title}</h2>
        <p className="text-xs text-ink-3 num">
          {items.length} {items.length !== 1 ? `${noun}s` : noun}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState embedded icon={<HoldingsEmptyIcon />} title={emptyMessage} description={emptySubMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule-strong text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
                <th className="text-left font-medium px-4 sm:px-6 py-2">{nameHeader}</th>
                <th className="text-right font-medium px-3 py-2">Units</th>
                <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">Book</th>
                <th className="text-right font-medium px-4 sm:px-6 py-2">Current</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const rupees = item.asset_type === asset_type.rupees
                return (
                  <tr key={item.id} className="border-b border-rule last:border-b-0 hover:bg-sunken transition-colors">
                    <td className="px-4 sm:px-6 py-2.5">
                      <Link href={item.link} className="text-ink hover:text-accent">
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-2 num whitespace-nowrap">{rupees ? '' : qty_fmt.format(item.quantity)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2 whitespace-nowrap hidden sm:table-cell">
                      {rupees || item.txn_value === null ? '' : <MaskedAmount value={item.txn_value} />}
                    </td>
                    <td className="px-4 sm:px-6 py-2.5 text-right text-ink whitespace-nowrap">
                      <MaskedAmount value={item.current_value} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
