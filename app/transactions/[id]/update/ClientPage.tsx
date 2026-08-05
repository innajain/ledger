'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { asset_type } from '@/generated/prisma/enums'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'
import { save_attachments, delete_attachment, type AttachmentInput } from '@/app/_actions/attachments'
import { ActionResult } from '@/app/_actions/_result'
import { TransactionLineItems, LineItemData } from '@/app/_components/TransactionLineItems'
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
  external_ref?: string | null
}

type ExistingAttachment = { id: string; url: string; filename: string; content_type: string | null; size: number | null }

export default function ClientPage({
  transaction,
  accounts,
  assets,
  defaults,
  updateTransaction,
  existingAttachments = [],
  attachmentsEnabled = false,
}: {
  transaction: {
    id: string
    date: Date
    description: string | null
    external_ref: string | null
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
    opts?: { external_ref?: string | null },
  ) => Promise<ActionResult>
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
  const [date, setDate] = useState(() => toLocalDateTimeInputValue(transaction.date))
  const [description, setDescription] = useState(transaction.description ?? '')
  const [externalRef, setExternalRef] = useState(transaction.external_ref ?? '')
  const [items, setItems] = useState<LineItemData[]>(
    transaction.line_items.map(li => ({
      accounting_head_id: li.accounting_head_id,
      asset_id: li.asset_id,
      quantity: li.quantity === null ? null : String(li.quantity),
      txn_value: li.txn_value == null ? null : String(li.txn_value),
      description: li.description ?? '',
      datetime: li.datetime ? toLocalDateTimeInputValue(li.datetime) : '',
      external_ref: li.external_ref ?? null,
    })),
  )
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentInput[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDeleteExisting(id: string) {
    const result = await delete_attachment(id)
    if (!result.success) throw new Error(result.message)
  }

  function addItemForType(typeKey: string) {
    const defaultAcc = pickDefaultAccount(accounts, defaults, typeKey as AccountTypeKey)
    const defaultAsset = pickDefaultAsset(assets, defaults)
    setItems(prev => [
      {
        accounting_head_id: defaultAcc?.id ?? '',
        asset_id: defaultAsset?.id ?? '',
        quantity: null,
        txn_value: null,
        description: '',
        datetime: '',
      },
      ...prev,
    ])
  }

  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(idx: number, field: keyof LineItemData, value: string | null) {
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
  }

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
        external_ref: it.external_ref ?? null,
      }))
      // Only touch refs when the field actually changed — carried per-line
      // refs (incl. multi-account-line transactions) pass through untouched
      const refChanged = externalRef.trim() !== (transaction.external_ref ?? '')
      const result = await updateTransaction(
        transaction.id,
        line_items,
        new Date(date),
        description || null,
        refChanged ? { external_ref: externalRef.trim() === '' ? null : externalRef.trim() } : undefined,
      )
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

  return (
    <div className="space-y-6">
      {}
      <div>
        <Link
          href={`/transactions/${transaction.id}`}
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Transaction
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Edit Transaction</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Update transaction details and line items</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Transaction Details</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date & Time</label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Enter transaction description"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Reference <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span>
              </label>
              <input
                type="text"
                value={externalRef}
                onChange={e => setExternalRef(e.target.value)}
                placeholder="Bank / UPI reference, e.g. UPI-621663575718"
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent font-mono text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Used to match this entry against bank statements when reconciling</p>
            </div>

            {attachmentsEnabled && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Attachments</label>
                <AttachmentUpload
                  existingAttachments={existingAttachments}
                  onPendingChange={setPendingAttachments}
                  onDeleteExisting={handleDeleteExisting}
                />
              </div>
            )}
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

        {}
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200">
          <Link
            href={`/transactions/${transaction.id}`}
            className="px-6 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {busy ? 'Updating...' : 'Update Transaction'}
          </button>
        </div>
      </form>
    </div>
  )
}
