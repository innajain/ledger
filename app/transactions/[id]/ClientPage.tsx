'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { asset_type } from '@/generated/prisma/enums'
import { delete_transaction_with_snapshot } from '@/app/_actions/transactions'
import { cancel_request } from '@/app/_actions/approvals'
import type { ActionResult } from '@/app/_actions/_result'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { Button, ButtonLink } from '@/app/_components/Button'
import { ChevronLeftIcon, PencilIcon, TrashIcon, CloseIcon, ErrorCircleIcon } from '@/app/_components/icons'
import { format_bytes } from '@/app/_utils/format_bytes'
import type { TransactionStatus } from '@/app/_utils/links'

type Attachment = { id: string; url: string; filename: string; content_type: string | null; size: number | null }

const statusBannerCls: Record<TransactionStatus['severity'], string> = {
  error: 'rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-800 dark:text-red-200',
  warning:
    'rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200',
  info: 'rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200',
  success:
    'rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 px-4 py-3 text-sm text-green-800 dark:text-green-200',
}

export default function ClientPage({
  transaction,
  linkStatus,
  cancellable = [],
  convertFutureTransaction,
}: {
  linkStatus?: TransactionStatus
  cancellable?: { link_id: string; other_username: string }[]
  convertFutureTransaction: (id: string) => Promise<ActionResult<{ accounting_head_ids: string[] }>>
  transaction: {
    id: string
    date: string
    description: string | null
    is_future: boolean
    /** Transaction groups it belongs to — labels only, no effect on any figure. */
    groups: { id: string; name: string }[]
    total: number
    attachments: Attachment[]
    line_items: {
      id: string
      accounting_head_id: string
      account_name: string
      accounting_head_type: string
      asset_id: string
      asset_name: string
      asset_type: asset_type
      quantity: number | null
      txn_value: number | null
      description: string | null
      datetime: Date | null
    }[]
  }
}) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    const message = linkStatus
      ? 'Delete this transaction? The linked user will be asked to approve deleting their copy. You can undo from the transactions list.'
      : 'Delete this transaction? You can undo it from the transactions list right after.'
    if (!confirm(message)) return
    setIsDeleting(true)
    setError(null)
    try {
      const result = await delete_transaction_with_snapshot(transaction.id)
      if (!result.success) throw new Error(result.message)
      // Stash the snapshot so the transactions list can offer an Undo toast
      try {
        sessionStorage.setItem('ledger_undo_delete', JSON.stringify(result.data!.snapshot))
      } catch {}
      router.push('/transactions')
    } catch (err: unknown) {
      setError("Couldn't delete the transaction: " + (err instanceof Error ? err.message : String(err)))
      setIsDeleting(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Cancel the pending request and revert this transaction to the last approved version?')) return
    setCancelling(true)
    setError(null)
    try {
      for (const c of cancellable) {
        const result = await cancel_request(c.link_id)
        if (!result.success) throw new Error(result.message)
      }
      router.refresh()
    } catch (err: unknown) {
      setError("Couldn't cancel the request: " + (err instanceof Error ? err.message : String(err)))
      setCancelling(false)
    }
  }

  const handleConvert = async () => {
    setError(null)
    setIsConverting(true)
    try {
      const result = await convertFutureTransaction(transaction.id)
      if (!result.success) throw new Error(result.message)
      router.refresh()
    } catch (err: unknown) {
      setError("Couldn't convert the transaction: " + (err instanceof Error ? err.message : String(err)))
      setIsConverting(false)
    }
  }

  // Named for what it is now that `transaction.groups` (the user's own labels) is
  // also in scope: this one buckets line items by head type for the three cards.
  const linesByType: Record<string, typeof transaction.line_items> = {
    account: [],
    allocation: [],
    income_expense: [],
  }

  for (const li of transaction.line_items) {
    const t = li.accounting_head_type ?? 'account'
    if (!linesByType[t]) linesByType[t] = []
    linesByType[t].push(li)
  }

  const headTypeConfig = {
    account: {
      title: 'Accounts',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      title: 'Allocations',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      ),
      color: 'orange',
    },
    income_expense: {
      title: 'Income & Expenses',
      icon: (
        <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      {linkStatus && (
        <div className={`${statusBannerCls[linkStatus.severity]} flex flex-wrap items-center justify-between gap-3`}>
          <span>{linkStatus.text}</span>
          <div className="flex items-center gap-4 shrink-0">
            {cancellable.length > 0 && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="font-medium underline opacity-80 hover:opacity-100 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel request'}
              </button>
            )}
            <Link href="/requests" className="font-medium underline">
              Requests
            </Link>
          </div>
        </div>
      )}
      <Link
        href="/transactions"
        className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium"
      >
        <ChevronLeftIcon />
        Transactions
      </Link>

      {transaction.is_future && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-indigo-900 dark:text-indigo-100">
            This is a future transaction — it doesn&apos;t affect balances until converted to a real transaction.
          </p>
          <Button variant="primary" onClick={handleConvert} disabled={isConverting} size="sm" className="shrink-0">
            {isConverting ? 'Converting…' : 'Convert to real transaction'}
          </Button>
        </div>
      )}

      {}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            {/* The specific thing is the title; "transaction" is already in the breadcrumb. */}
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">{transaction.description || 'Transaction'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              <LocalDateTime value={transaction.date} />
            </p>
            {transaction.groups.length > 0 && (
              <ul className="flex flex-wrap gap-2 mt-3">
                {transaction.groups.map(g => (
                  <li key={g.id}>
                    <Link
                      href={`/groups/${g.id}`}
                      className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                      {g.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {}
        <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-100 mb-1">Total</p>
          <p
            className={`text-3xl font-bold ${
              transaction.total > 0
                ? 'text-green-600 dark:text-green-400'
                : transaction.total < 0
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <MaskedAmount value={transaction.total} />
          </p>
        </div>

        {}
        <div className="flex justify-end gap-2 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <ButtonLink href={`/transactions/${transaction.id}/update`} variant="primary">
            <PencilIcon />
            Edit
          </ButtonLink>
          <Button variant="dangerOutline" onClick={handleDelete} disabled={isDeleting}>
            <TrashIcon />
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>

      {}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <ErrorCircleIcon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {}
      {transaction.attachments.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Attachments</h2>
          <div className="space-y-2">
            {transaction.attachments.map(att => (
              <div
                key={att.id}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
              >
                {att.content_type?.startsWith('image/') && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={att.url} alt={att.filename} className="h-10 w-10 object-cover rounded shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
                  >
                    {att.filename}
                  </a>
                  {att.size && <p className="text-xs text-slate-500 dark:text-slate-400">{format_bytes(att.size)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Line items</h2>

        {(['account', 'allocation', 'income_expense'] as const).map(typeKey => {
          const items = linesByType[typeKey] || []
          if (!items || items.length === 0) return null

          const config = headTypeConfig[typeKey]
          // Section identity as a small colored icon on a quiet header, not a tinted banner.
          const iconColor = {
            green: 'text-green-600 dark:text-green-400',
            orange: 'text-orange-600 dark:text-orange-400',
            purple: 'text-purple-600 dark:text-purple-400',
          }

          return (
            <div
              key={typeKey}
              className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors"
            >
              <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
                <div className={`flex items-center gap-2 ${iconColor[config.color as keyof typeof iconColor]}`}>
                  {config.icon}
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{config.title}</h3>
                </div>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {items.map(li => (
                  <li key={li.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Link
                            href={`/heads/${li.accounting_head_type}/${li.accounting_head_id}`}
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
                            <span className="font-medium">{li.quantity === null ? '—' : <MaskedAmount value={li.quantity} />}</span>
                          ) : (
                            <div className="flex items-center gap-4">
                              <span>{li.quantity} units</span>
                              <span>Book: {li.txn_value === null ? '—' : <MaskedAmount value={li.txn_value} />}</span>
                            </div>
                          )}
                        </div>

                        {li.description && <p className="text-sm italic text-slate-500 dark:text-slate-400 mt-2">{li.description}</p>}
                        {li.datetime && (
                          <p className="text-xs text-slate-400 mt-1">
                            <LocalDateTime value={li.datetime} />
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
