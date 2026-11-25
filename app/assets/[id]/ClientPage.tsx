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
import { HoldingsGrid } from '@/app/_components/HoldingsGrid'
import { EmptyState } from '@/app/_components/EmptyState'
import { TransactionEmptyIcon } from '@/app/_components/EmptyStateIcons'

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
  type: asset_type
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
        <Link href={`/assets/${asset.parent.id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-accent transition-colors">
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
            value: <span className="text-ink font-medium">{asset_type_label(asset.type)}</span>,
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
                    <span className={`num ${asset.xirr > 0 ? 'text-pos' : asset.xirr < 0 ? 'text-neg' : 'text-ink-3'}`}>
                      {(asset.xirr * 100).toFixed(2)}%
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      <div className="sheet p-4 sm:p-6">
        <div className={`grid grid-cols-1 ${asset.txn_value_total !== null ? 'sm:grid-cols-3' : ''} gap-4`}>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">Total across accounts</p>
            <p className="font-serif text-3xl leading-tight text-ink mt-1">
              <MaskedAmount value={asset.total} numeric={false} />
            </p>
          </div>
          {asset.current_investment !== null && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">Current investment</p>
              <p className="font-serif text-3xl leading-tight text-ink mt-1">
                <MaskedAmount value={asset.current_investment} numeric={false} />
              </p>
            </div>
          )}
          {asset.txn_value_total !== null && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">Total book value</p>
              <p className="font-serif text-3xl leading-tight text-ink mt-1">
                <MaskedAmount value={asset.txn_value_total} numeric={false} />
              </p>
            </div>
          )}
        </div>
      </div>

      {asset.children && asset.children.length > 0 && (
        <Card>
          <div className="p-4 sm:p-6 border-b border-rule">
            <h2 className="text-xl font-medium text-ink">Sub-assets</h2>
            <p className="text-sm text-ink-3 mt-1">
              {asset.children.length} child {asset.children.length !== 1 ? 'assets' : 'asset'}
            </p>
          </div>
          <div className="divide-y divide-rule">
            {asset.children.map(child => (
              <Link
                key={child.id}
                href={`/assets/${child.id}`}
                className="flex items-center justify-between gap-4 p-4 hover:bg-sunken transition-colors group"
              >
                <span className="font-medium text-ink group-hover:text-accent transition-colors">{child.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-400 group-hover:text-accent transition-colors">→</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <HoldingsGrid
        title="Held in accounts"
        nameHeader="Account"
        noun="account"
        items={asset.breakdown.map(b => ({
          id: b.accounting_head_id,
          name: b.account_name,
          link: `/heads/account/${b.accounting_head_id}`,
          asset_type: asset.type,
          quantity: b.quantity,
          txn_value: b.txn_value,
          current_value: b.current_value,
        }))}
        emptyMessage="Not held anywhere yet"
        emptySubMessage="Accounts holding this asset appear here once a transaction records it."
      />

      {asset.allocation_breakdown.length > 0 && (
        <HoldingsGrid
          title="Held in allocations"
          nameHeader="Allocation"
          noun="allocation"
          items={asset.allocation_breakdown.map(b => ({
            id: b.allocation_id,
            name: b.allocation_name,
            link: `/heads/allocation/${b.allocation_id}`,
            asset_type: asset.type,
            quantity: b.quantity,
            txn_value: b.txn_value,
            current_value: b.current_value,
          }))}
        />
      )}

      {}
      <div className="sheet">
        <div className="p-4 sm:p-6 border-b border-rule">
          <h2 className="text-xl font-medium text-ink">Line items</h2>
          <p className="text-sm text-ink-3 mt-1">
            {lineItems.total} item
            {lineItems.total !== 1 ? 's' : ''}
          </p>
        </div>

        {lineItems.items.length === 0 ? (
          <EmptyState
            embedded
            icon={<TransactionEmptyIcon />}
            title="No line items yet"
            description="Line items appear here once a transaction records this asset."
          />
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
                  <div key={li.id} className={`p-4 hover:bg-sunken transition-colors ${is_depleted ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Link
                            href={`/transactions/${li.transaction_id}`}
                            className="font-semibold text-ink hover:text-accent transition-colors truncate"
                          >
                            {li.transaction_description || li.line_item_description || li.account_name}
                          </Link>
                          <Link
                            href={`/heads/account/${li.accounting_head_id}`}
                            className="shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-sunken text-ink-2 hover:text-accent transition-colors"
                          >
                            {li.account_name}
                          </Link>
                        </div>

                        {li.line_item_description && li.line_item_description !== (li.transaction_description || li.line_item_description) && (
                          <p className="text-sm text-ink-2 mt-1">{li.line_item_description}</p>
                        )}
                        <p className="text-xs text-ink-3 mt-1">
                          <LocalDateTime value={li.transaction_date} />
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          {asset.type !== asset_type.rupees && (
                            <>
                              <div className="text-ink-2">
                                <span className="text-ink-3">Quantity:</span> <span className="font-medium text-ink">{li.quantity} units</span>
                              </div>
                              {li.remaining_quantity !== null && (
                                <div className="text-ink-2">
                                  <span className="text-ink-3">Remaining:</span>{' '}
                                  <span className="font-medium text-ink">{li.remaining_quantity} units</span>
                                  {remaining_txn_value !== null && (
                                    <>
                                      {' '}
                                      <span className="text-ink-3">
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
                        <div className="text-lg font-semibold text-ink">
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
                    className="px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft rounded-lg transition-colors disabled:opacity-60"
                  >
                    {lineItems.loading
                      ? 'Loading…'
                      : `Show ${Math.min(LINE_ITEMS_PAGE, lineItems.remaining)} more (${lineItems.remaining} remaining)`}
                  </button>
                  {lineItems.error && <p className="mt-2 text-sm text-neg">{lineItems.error}</p>}
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
