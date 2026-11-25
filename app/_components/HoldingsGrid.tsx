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
  linkLabel?: string
}

export function HoldingsGrid({
  title,
  items,
  emptyMessage = 'No holdings yet',
  emptySubMessage = 'Holdings will appear here once transactions are recorded',
  linkLabel = 'View details →',
}: HoldingsGridProps) {
  return (
    <Card>
      <div className="p-4 sm:p-6 border-b border-rule">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-sm text-ink-3 mt-1">
          {items.length} {items.length !== 1 ? 'items' : 'item'}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState embedded icon={<HoldingsEmptyIcon />} title={emptyMessage} description={emptySubMessage} />
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
            {items.map((item, i) => (
              <div key={i} className="bg-raised rounded-lg p-4 border border-rule shadow-sm transition-colors">
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <Link href={item.link} className="text-ink font-semibold hover:text-accent transition-colors">
                      {item.name}
                    </Link>

                    <div className="mt-3 text-sm text-ink-2 space-y-2">
                      {item.asset_type === asset_type.rupees ? (
                        <div>
                          <span className="text-ink-3">Value:</span>{' '}
                          <span className="font-medium text-ink">
                            <MaskedAmount value={item.current_value} />
                          </span>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-ink-3">Quantity:</span> <span className="font-medium text-ink">{item.quantity} units</span>
                          </div>
                          <div>
                            <span className="text-ink-3">Book:</span>{' '}
                            <span className="font-medium text-ink">{item.txn_value === null ? '—' : <MaskedAmount value={item.txn_value} />}</span>
                          </div>
                          <div>
                            <span className="text-ink-3">Current:</span>{' '}
                            <span className="font-medium text-ink">
                              <MaskedAmount value={item.current_value} />
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 text-right">
                    <Link href={item.link} className="text-xs text-accent hover:text-accent font-medium">
                      {linkLabel}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
