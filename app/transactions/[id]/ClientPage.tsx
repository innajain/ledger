'use client'

import Link from 'next/link'
import { useState } from 'react'
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { account_type, asset_type } from '@/generated/prisma/enums'
import { delete_transaction } from '@/app/_actions/transactions'

export default function ClientPage({
  transaction,
}: {
  transaction: {
    id: string
    date: string
    description: string | null
    total: number
    line_items: {
      id: string
      account_id: string
      account_name: string
      account_type: string
      asset_id: string
      asset_name: string
      asset_type: asset_type
      quantity: number | null
      book_value: number | null
      description: string | null
      datetime: Date | null
    }[]
  }
}) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!confirm('Delete this transaction? This action cannot be undone.')) return
    setIsDeleting(true)
    setError(null)
    try {
      const result = await delete_transaction(transaction.id)
      if (!result.success) throw new Error(result.message)
      window.location.href = '/transactions'
    } catch (err: unknown) {
      setError('Delete failed: ' + (err instanceof Error ? err.message : String(err)))
      setIsDeleting(false)
    }
  }

  // Group line items by account type
  const groups: Record<string, typeof transaction.line_items> = {
    real: [],
    allocation: [],
    nominal: [],
  }

  for (const li of transaction.line_items) {
    const t = li.account_type ?? 'real'
    if (!groups[t]) groups[t] = []
    groups[t].push(li)
  }

  const accountTypeConfig = {
    real: {
      title: 'Real Accounts',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
          />
        </svg>
      ),
      color: 'green',
    },
    allocation: {
      title: 'Allocation Accounts',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      ),
      color: 'orange',
    },
    nominal: {
      title: 'Nominal Accounts',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      ),
      color: 'purple',
    },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Transaction Details</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {new Date(transaction.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            {transaction.description && <p className="text-slate-700 dark:text-slate-300 mt-2">{transaction.description}</p>}
          </div>
        </div>

        {/* Total */}
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100 mb-1">Transaction Total</p>
          <p
            className={`text-3xl font-bold ${
              transaction.total > 0 ? 'text-green-600' : transaction.total < 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {currency_fmt.format(transaction.total)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <Link
            href={`/transactions/${transaction.id}/update`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Line Items */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Line Items</h2>

        {(['real', 'allocation', 'nominal'] as const).map(typeKey => {
          const items = groups[typeKey] || []
          if (!items || items.length === 0) return null

          const config = accountTypeConfig[typeKey]
          const colorClasses = {
            green: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
            orange: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100',
            purple: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100',
          }

          return (
            <div
              key={typeKey}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors"
            >
              <div className={`px-6 py-3 border-b ${colorClasses[config.color as keyof typeof colorClasses]}`}>
                <div className="flex items-center gap-2">
                  {config.icon}
                  <h3 className="font-semibold">{config.title}</h3>
                </div>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {items.map(li => (
                  <li key={li.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={
                              li.account_type === account_type.real
                                ? `/accounts/${li.account_id}`
                                : li.account_type === account_type.allocation
                                  ? `/allocations/${li.account_id}`
                                  : `/income_expenses/${li.account_id}`
                            }
                            className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {li.account_name}
                          </Link>
                          <span className="text-slate-400">→</span>
                          <Link
                            href={`/assets/${li.asset_id}`}
                            className="text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            {li.asset_name}
                          </Link>
                        </div>

                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {li.asset_type === asset_type.rupees ? (
                            <span className="font-medium">{li.quantity === null ? '—' : currency_fmt.format(li.quantity)}</span>
                          ) : (
                            <div className="flex items-center gap-4">
                              <span>{li.quantity} units</span>
                              <span>Book: {li.book_value === null ? '—' : currency_fmt.format(li.book_value)}</span>
                            </div>
                          )}
                        </div>

                        {li.description && <p className="text-sm italic text-slate-500 dark:text-slate-400 mt-2">{li.description}</p>}
                        {li.datetime && (
                          <p className="text-xs text-slate-400 mt-1" suppressHydrationWarning>
                            {new Date(li.datetime).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
