'use client'

import Link from 'next/link'
import { useMoreItems } from '@/app/_components/use_more_items'
import { LINE_ITEMS_PAGE } from '@/app/_utils/line_item_paging'
import type { ActionResult } from '@/app/_actions/_result'
import { ViewPageHeader, InfoCard } from '@/app/_components/ViewPageComponents'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { asset_type } from '@/generated/prisma/enums'
import { precise_plain_currency_fmt } from '@/app/_utils/currency_formatter'
import { asset_type_label } from '@/app/_utils/labels'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { ValueChart, type ValuePoint } from '@/app/_components/ValueChart'
import { Card } from '@/app/_components/Card'

type BreakdownItem = {
  accounting_head_id: string
  account_name: string
  quantity: number
  txn_value: number | null
  current_value: number
}

export type AssetLineItem = {
  id: string
  accounting_head_id: string
  account_name: string
  quantity: number
  txn_value: number | null
  current_value: number
  transaction_id: string
  transaction_date: string
  transaction_description: string | null
  line_item_description: string | null
  remaining_quantity: number | null
}

type AllocationBreakdownItem = {
  allocation_id: string
  allocation_name: string
  quantity: number
  txn_value: number | null
  current_value: number
}

type AssetForClient = {
  id: string
  name: string
  type: string
  ticker: string | null
  parent: { id: string; name: string } | null
  children?: { id: string; name: string }[]
  total: number
  txn_value_total: number | null
  current_investment: number | null
  price: number | null
  xirr?: number | null
  breakdown: BreakdownItem[]
  allocation_breakdown: AllocationBreakdownItem[]
  // The first page of line items, newest first; `line_item_count` is the full count and
  // the rest come from `loadMoreLineItems`.
  line_items?: AssetLineItem[]
  line_item_count?: number
  value_timeseries?: ValuePoint[]
}

// A stable empty list: useMoreItems ties loaded pages to the first page's identity.
const EMPTY_LINE_ITEMS: AssetLineItem[] = []

export default function ClientPage({
  asset,
  isAdmin,
  loadMoreLineItems,
}: {
  asset: AssetForClient
  isAdmin: boolean
  loadMoreLineItems?: (asset_id: string, offset: number) => Promise<ActionResult<AssetLineItem[]>>
}) {
  const firstLineItems = asset.line_items ?? EMPTY_LINE_ITEMS
  const lineItems = useMoreItems(
    firstLineItems,
    loadMoreLineItems ? (asset.line_item_count ?? firstLineItems.length) : firstLineItems.length,
    offset => loadMoreLineItems!(asset.id, offset),
  )
  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink="/assets"
        backText="Assets"
        title={asset.name}
        editLink={isAdmin ? `/assets/${asset.id}/update` : undefined}
        editText={isAdmin ? 'Edit asset' : undefined}
      />

      {asset.parent && (
        <Link
          href={`/assets/${asset.parent.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <span aria-hidden>↑</span>
          <span>
            Part of <span className="font-medium">{asset.parent.name}</span>
          </span>
        </Link>
      )}

      <InfoCard
        title="Asset details"
        fields={[
          {
            label: 'Type',
            value: <span className="text-slate-900 dark:text-slate-100 font-medium">{asset_type_label(asset.type)}</span>,
          },
          { label: 'Ticker', value: asset.ticker ?? '—' },
          ...((asset.type === asset_type.mf || asset.type === asset_type.etf || asset.type === asset_type.shares) && asset.price !== null
            ? [
                {
                  label: 'Current price',
                  value: precise_plain_currency_fmt.format(asset.price),
                },
              ]
            : []),
          ...(asset.xirr !== undefined && asset.xirr !== null
            ? [
                {
                  label: 'XIRR',
                  value: (
                    <span
                      className={
                        asset.xirr > 0
                          ? 'text-green-600 dark:text-green-400 font-semibold'
                          : asset.xirr < 0
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 font-semibold'
                      }
                    >
                      {(asset.xirr * 100).toFixed(2)}%
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
        <div className={`grid grid-cols-1 ${asset.txn_value_total !== null ? 'sm:grid-cols-3' : ''} gap-4`}>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total across accounts</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              <MaskedAmount value={asset.total} />
            </p>
          </div>
          {asset.current_investment !== null && (
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Current investment</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                <MaskedAmount value={asset.current_investment} />
              </p>
            </div>
          )}
          {asset.txn_value_total !== null && (
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total book value</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                <MaskedAmount value={asset.txn_value_total} />
              </p>
            </div>
          )}
        </div>
      </div>

      {asset.children && asset.children.length > 0 && (
        <Card>
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sub-assets</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {asset.children.length} child {asset.children.length !== 1 ? 'assets' : 'asset'}
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {asset.children.map(child => (
              <Link
                key={child.id}
                href={`/assets/${child.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group"
              >
                <span className="font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {child.name}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">→</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Held in accounts</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {asset.breakdown.length} account
            {asset.breakdown.length !== 1 ? 's' : ''}
          </p>
        </div>

        {asset.breakdown.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <p className="text-slate-600 dark:text-slate-400 font-medium">No holdings yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Holdings will appear here once transactions are recorded</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {asset.breakdown.map((b, i) => (
                  <div key={i} className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600 shadow-sm">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link
                          href={`/heads/account/${b.accounting_head_id}`}
                          className="text-slate-900 dark:text-slate-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {b.account_name}
                        </Link>

                        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                          {asset.type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Value:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                <MaskedAmount value={b.current_value} />
                              </span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{b.quantity} units</span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Book:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {b.txn_value === null ? '—' : <MaskedAmount value={b.txn_value} />}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Current:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  <MaskedAmount value={b.current_value} />
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 text-right">
                        <Link href={`/heads/account/${b.accounting_head_id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          View account →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {asset.allocation_breakdown.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Held in allocations</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {asset.allocation_breakdown.length} allocation{asset.allocation_breakdown.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {asset.allocation_breakdown.map((b, i) => (
                  <div key={i} className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600 shadow-sm">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link
                          href={`/heads/allocation/${b.allocation_id}`}
                          className="text-slate-900 dark:text-slate-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {b.allocation_name}
                        </Link>
                        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                          {asset.type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Value:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                <MaskedAmount value={b.current_value} />
                              </span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{b.quantity} units</span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Book:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  {b.txn_value === null ? '—' : <MaskedAmount value={b.txn_value} />}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Current:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">
                                  <MaskedAmount value={b.current_value} />
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 text-right">
                        <Link href={`/heads/allocation/${b.allocation_id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          View allocation →
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Line items</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {lineItems.total} item
            {lineItems.total !== 1 ? 's' : ''}
          </p>
        </div>

        {lineItems.items.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">No transactions for this asset</div>
        ) : (
          <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
            <div>
              {lineItems.items.map(li => {
                const is_depleted = li.remaining_quantity !== null && li.remaining_quantity === 0
                const remaining_txn_value =
                  li.remaining_quantity !== null && li.txn_value !== null && li.quantity !== 0
                    ? (li.remaining_quantity / li.quantity) * li.txn_value
                    : null
                return (
                  <div key={li.id} className={`p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${is_depleted ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Link
                            href={`/transactions/${li.transaction_id}`}
                            className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                          >
                            {li.transaction_description || li.line_item_description || li.account_name}
                          </Link>
                          <Link
                            href={`/heads/account/${li.accounting_head_id}`}
                            className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {li.account_name}
                          </Link>
                        </div>

                        {li.line_item_description && li.line_item_description !== (li.transaction_description || li.line_item_description) && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{li.line_item_description}</p>
                        )}
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          <LocalDateTime value={li.transaction_date} />
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {asset.type !== asset_type.rupees && (
                            <>
                              <div className="text-slate-600 dark:text-slate-400">
                                <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{li.quantity} units</span>
                              </div>
                              {li.remaining_quantity !== null && (
                                <div className="text-slate-600 dark:text-slate-400">
                                  <span className="text-slate-500 dark:text-slate-400">Remaining:</span>{' '}
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{li.remaining_quantity} units</span>
                                  {remaining_txn_value !== null && (
                                    <>
                                      {' '}
                                      <span className="text-slate-500 dark:text-slate-400">
                                        (<MaskedAmount value={remaining_txn_value} /> book)
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          <MaskedAmount value={li.txn_value !== null ? li.txn_value : li.quantity} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {lineItems.remaining > 0 && (
                <div className="p-3 text-center">
                  <button
                    type="button"
                    onClick={lineItems.showMore}
                    disabled={lineItems.loading}
                    className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {lineItems.loading
                      ? 'Loading…'
                      : `Show ${Math.min(LINE_ITEMS_PAGE, lineItems.remaining)} more (${lineItems.remaining} remaining)`}
                  </button>
                  {lineItems.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{lineItems.error}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {asset.value_timeseries && asset.value_timeseries.length > 0 && <ValueChart points={asset.value_timeseries} title="Value over time" />}
    </div>
  )
}
