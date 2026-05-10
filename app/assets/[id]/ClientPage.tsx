'use client'

import Link from 'next/link'
import { ViewPageHeader, InfoCard } from '@/app/_components/ViewPageComponents'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { asset_type } from '@/generated/prisma/enums'
import { currency_fmt, precise_currency_fmt } from '@/app/_utils/currency_formatter'

type BreakdownItem = {
  account_id: string
  account_name: string
  quantity: number
  book_value: number | null
  current_value: number
}

type LineItem = {
  id: string
  account_id: string
  account_name: string
  quantity: number
  book_value: number | null
  current_value: number
  transaction_id: string
  transaction_date: string
  transaction_description: string | null
  line_item_description: string | null
}

type AllocationBreakdownItem = {
  allocation_id: string
  allocation_name: string
  quantity: number
  book_value: number | null
  current_value: number
}

type AssetForClient = {
  id: string
  name: string
  type: string
  ticker: string | null
  parent: { id: string; name: string } | null
  total: number
  book_value_total: number | null
  price: number | null
  xirr?: number | null
  breakdown: BreakdownItem[]
  allocation_breakdown: AllocationBreakdownItem[]
  line_items?: LineItem[]
}

export default function ClientPage({ asset }: { asset: AssetForClient }) {
  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink="/assets"
        backText="Back to Assets"
        title={asset.name}
        description="Asset details and holdings breakdown"
        editLink={`/assets/${asset.id}/update`}
        editText="Edit Asset"
      />

      <InfoCard
        title="Asset Information"
        fields={[
          {
            label: 'Asset Type',
            value: <span className="capitalize">{asset.type}</span>,
          },
          { label: 'Ticker', value: asset.ticker ?? '—' },
          {
            label: 'Parent Asset',
            value: asset.parent ? asset.parent.name : '—',
          },
          ...((asset.type === asset_type.mf || asset.type === asset_type.etf || asset.type === asset_type.shares) && asset.price !== null
            ? [
                {
                  label: 'Current Price',
                  value: precise_currency_fmt.format(asset.price),
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

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <div className={`grid grid-cols-1 ${asset.book_value_total !== null ? 'sm:grid-cols-2' : ''} gap-4`}>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Across Real Accounts</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{currency_fmt.format(asset.total)}</p>
          </div>
          {asset.book_value_total !== null && (
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Book Value</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">{currency_fmt.format(asset.book_value_total)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Holdings (aggregated by account)</h2>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
                {asset.breakdown.map((b, i) => (
                  <div key={i} className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600 shadow-sm">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link
                          href={`/accounts/${b.account_id}`}
                          className="text-slate-900 dark:text-slate-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {b.account_name}
                        </Link>

                        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                          {asset.type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Value:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(b.current_value)}</span>
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
                                  {b.book_value === null ? '—' : currency_fmt.format(b.book_value)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Current:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(b.current_value)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 text-right">
                        <Link href={`/accounts/${b.account_id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          View Account →
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
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Holdings (aggregated by allocation)</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {asset.allocation_breakdown.length} allocation{asset.allocation_breakdown.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-80 overflow-y-auto">
                {asset.allocation_breakdown.map((b, i) => (
                  <div key={i} className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-slate-200 dark:border-slate-600 shadow-sm">
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Link
                          href={`/allocations/${b.allocation_id}`}
                          className="text-slate-900 dark:text-slate-100 font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {b.allocation_name}
                        </Link>
                        <div className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                          {asset.type === asset_type.rupees ? (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Value:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(b.current_value)}</span>
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
                                  {b.book_value === null ? '—' : currency_fmt.format(b.book_value)}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 dark:text-slate-400">Current:</span>{' '}
                                <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(b.current_value)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 text-right">
                        <Link href={`/allocations/${b.allocation_id}`} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                          View Allocation →
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

      {/* Transaction Line Items (original per-transaction data) */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transaction Line Items</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {(asset.line_items ?? []).length} item
            {(asset.line_items ?? []).length !== 1 ? 's' : ''}
          </p>
        </div>

        {(asset.line_items ?? []).length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">No transactions for this asset</div>
        ) : (
          <div className="divide-y divide-slate-200">
            <div className="max-h-96 overflow-y-auto">
              {(asset.line_items ?? []).map(li => (
                <div key={li.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <Link
                          href={`/accounts/${li.account_id}`}
                          className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {li.account_name}
                        </Link>
                        <span>•</span>
                        <Link
                          href={`/transactions/${li.transaction_id}`}
                          className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          <LocalDateTime value={li.transaction_date} />
                        </Link>
                      </div>

                      {li.line_item_description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 italic">{li.line_item_description}</p>
                      )}
                      {li.transaction_description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Transaction: {li.transaction_description}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {asset.type === asset_type.rupees ? (
                          <div className="text-slate-600 dark:text-slate-400">
                            <span className="font-medium text-slate-900 dark:text-slate-100">{currency_fmt.format(li.current_value)}</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-600 dark:text-slate-400">
                              <span className="text-slate-500 dark:text-slate-400">Quantity:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">{li.quantity} units</span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-400">
                              <span className="text-slate-500 dark:text-slate-400">Book:</span>{' '}
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {li.book_value === null ? '—' : currency_fmt.format(li.book_value)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {currency_fmt.format(li.book_value !== null ? li.book_value : li.quantity)}
                      </div>
                      <Link
                        href={`/transactions/${li.transaction_id}`}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium mt-1 inline-block"
                      >
                        View Transaction →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
