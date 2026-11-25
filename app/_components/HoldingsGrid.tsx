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
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {items.length} {items.length !== 1 ? 'items' : 'item'}
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState embedded icon={<HoldingsEmptyIcon />} title={emptyMessage} description={emptySubMessage} />
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
            {items.map((item, i) => (
              <div
                key={i}
                className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600 shadow-sm transition-colors"
              >
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <Link
                      href={item.link}
                      className="text-slate-900 dark:text-slate-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {item.name}
                    </Link>

                    <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                      {item.asset_type === asset_type.rupees ? (
                        <div>
                          <span className="text-slate-500 dark:text-slate-400">Value:</span>{' '}
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            <MaskedAmount value={item.current_value} />
                          </span>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                            <span className="font-medium text-slate-900 dark:text-slate-100">{item.quantity} units</span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Book:</span>{' '}
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {item.txn_value === null ? '—' : <MaskedAmount value={item.txn_value} />}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Current:</span>{' '}
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              <MaskedAmount value={item.current_value} />
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 text-right">
                    <Link
                      href={item.link}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                    >
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
