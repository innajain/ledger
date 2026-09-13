'use client'

import React, { useState, useId, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { asset_type } from '@/generated/prisma/enums'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'
import { save_attachments, delete_attachment, type AttachmentInput } from '@/app/_actions/attachments'
import { ActionResult } from '@/app/_actions/_result'
import { TransactionLineItems, TransactionBalanceSummary, LineItemData, new_line_uid } from '@/app/_components/TransactionLineItems'
import { Button, ButtonLink } from '@/app/_components/Button'
import { ChevronLeftIcon } from '@/app/_components/icons'
import { AttachmentUpload } from '@/app/_components/AttachmentUpload'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import type { LineItemDefaults } from '@/app/_actions/preferences'
import { pickDefaultAccount, pickDefaultAsset, type AccountTypeKey } from '@/app/_utils/line_item_defaults'

type LineItem = {
  id: string
  accounting_head_id: string
  account_name: string
  accounting_head_type: string
  asset_id: string
  asset_name: string
  quantity: number | null
  txn_value: number | null
  description?: string | null
  datetime?: Date | null
}

type ExistingAttachment = { id: string; url: string; filename: string; content_type: string | null; size: number | null }

export default function ClientPage({
  transaction,
  accounts,
  assets,
  defaults,
  updateTransaction,
  convertFutureTransaction,
  existingAttachments = [],
  attachmentsEnabled = false,
}: {
  transaction: {
    id: string
    date: Date
    description: string | null
    is_future: boolean
    total: number
    line_items: LineItem[]
  }
  accounts: { id: string; name: string; type: string }[]
  assets: { id: string; name: string; type: asset_type }[]
  defaults: LineItemDefaults
  updateTransaction: (
    id: string,
    line_items: CreateLineItemInput[],
    datetime?: Date,
    description?: string | null,
    is_future?: boolean,
  ) => Promise<ActionResult>
  convertFutureTransaction: (id: string) => Promise<ActionResult<{ accounting_head_ids: string[] }>>
  existingAttachments?: ExistingAttachment[]
  attachmentsEnabled?: boolean
}) {
  function toLocalDateTimeInputValue(d: Date | string) {
    const dt = typeof d === 'string' ? new Date(d) : d
    if (!dt || isNaN(dt.getTime())) return ''
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    const hh = String(dt.getHours()).padStart(2, '0')
    const min = String(dt.getMinutes()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }

  const router = useRouter()
  const uid = useId()
  const [date, setDate] = useState(() => toLocalDateTimeInputValue(transaction.date))
  const [description, setDescription] = useState(transaction.description ?? '')
  const [isFuture, setIsFuture] = useState(transaction.is_future)
  const [items, setItems] = useState<LineItemData[]>(
    transaction.line_items.map(li => ({
      uid: new_line_uid(),
      accounting_head_id: li.accounting_head_id,
      asset_id: li.asset_id,
      quantity: li.quantity === null ? null : String(li.quantity),
      txn_value: li.txn_value == null ? null : String(li.txn_value),
      description: li.description ?? '',
      datetime: li.datetime ? toLocalDateTimeInputValue(li.datetime) : '',
    })),
  )
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDeleteExisting(id: string) {
    const result = await delete_attachment(id)
    if (!result.success) throw new Error(result.message)
  }

  // Stable identities so the memoized TransactionLineItems tree skips re-rendering on
  // header-field keystrokes (description/reference/date live in this component's state)
  const addItemForType = useCallback(
    (typeKey: string) => {
      const defaultAcc = pickDefaultAccount(accounts, defaults, typeKey as AccountTypeKey)
      const defaultAsset = pickDefaultAsset(assets, defaults)
      setItems(prev => [
        {
          uid: new_line_uid(),
          accounting_head_id: defaultAcc?.id ?? '',
          asset_id: defaultAsset?.id ?? '',
          quantity: null,
          txn_value: null,
          description: '',
          datetime: '',
        },
        ...prev,
      ])
    },
    [accounts, assets, defaults],
  )

  const removeItem = useCallback((i: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }, [])

  const updateItem = useCallback(
    (idx: number, field: keyof LineItemData, value: string | null) => {
      setItems(prev => {
        const copy = [...prev]
        const v: string = field === 'quantity' || field === 'txn_value' ? (value === null ? '' : value) : (value ?? '')
        copy[idx] = { ...copy[idx], [field]: v }

        if (field === 'asset_id') {
          const sel = assets.find(a => a.id === v)
          if (sel?.type === asset_type.rupees) copy[idx].txn_value = null
        }
        if (field === 'quantity' && value === null) {
          ;(copy[idx] as LineItemData).quantity = null
        }
        if (field === 'txn_value' && value === null) {
          ;(copy[idx] as LineItemData).txn_value = null
        }
        return copy
      })
    },
    [assets],
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const line_items = items.map(it => ({
        accounting_head_id: it.accounting_head_id,
        asset_id: it.asset_id,
        quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
        txn_value: it.txn_value === null || it.txn_value === '' ? null : Number(it.txn_value),
        description: it.description === '' ? null : it.description,
        datetime: it.datetime === '' ? null : new Date(it.datetime),
      }))
      const result = await updateTransaction(transaction.id, line_items, new Date(date), description || null, isFuture)
      if (result.success) {
        if (pendingAttachments.length > 0) {
          await save_attachments(transaction.id, pendingAttachments)
        }
        router.push(`/transactions/${transaction.id}`)
      } else {
        setError(result.message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function convertToReal() {
    setError(null)
    setBusy(true)
    try {
      const result = await convertFutureTransaction(transaction.id)
      if (result.success) {
        router.push(`/transactions/${transaction.id}`)
      } else {
        setError(result.message)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {}
      <div>
        <Link
          href={`/transactions/${transaction.id}`}
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4"
        >
          <ChevronLeftIcon />
          Transaction
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Edit transaction</h1>
      </div>

      {transaction.is_future && (
        <div className="rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-indigo-900 dark:text-indigo-100">
            This is a future transaction — it doesn&apos;t affect balances until converted to a real transaction.
          </p>
          <Button variant="primary" onClick={convertToReal} disabled={busy} className="shrink-0">
            {busy ? 'Converting…' : 'Convert to real transaction'}
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        {}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Transaction details</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor={`${uid}-date`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Date & time
              </label>
              <input
                id={`${uid}-date`}
                type="datetime-local"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
              {date && (
                <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic">
                  <LocalDateTime value={date} />
                </div>
              )}
            </div>

            <div>
              <label htmlFor={`${uid}-description`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Description
              </label>
              <input
                id={`${uid}-description`}
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Enter transaction description"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            {attachmentsEnabled && (
              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Attachments</span>
                <AttachmentUpload
                  existingAttachments={existingAttachments}
                  onPendingChange={setPendingAttachments}
                  onDeleteExisting={handleDeleteExisting}
                />
              </div>
            )}

            <div>
              <label
                htmlFor={`${uid}-is-future`}
                className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 p-4"
              >
                <input
                  id={`${uid}-is-future`}
                  type="checkbox"
                  checked={isFuture}
                  onChange={e => setIsFuture(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">Future transaction</span>
                  <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Won&apos;t affect balances, net worth or XIRR until converted to a real transaction.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

        {}
        <TransactionLineItems
          items={items}
          accounts={accounts}
          assets={assets}
          onAddItem={addItemForType}
          onRemoveItem={removeItem}
          onUpdateItem={updateItem}
        />

        {}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <TransactionBalanceSummary items={items} accounts={accounts} assets={assets} />

        {}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
          <ButtonLink href={`/transactions/${transaction.id}`} variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update transaction'}
          </Button>
        </div>
      </form>
    </div>
  )
}
