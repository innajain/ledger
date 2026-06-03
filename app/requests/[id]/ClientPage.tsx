'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { asset_type } from '@/generated/prisma/enums'
import { approve_request, revert_request } from '@/app/_actions/approvals'
import { TransactionLineItems, LineItemData } from '@/app/_components/TransactionLineItems'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import type { EditorContext } from '@/app/_utils/links'

// ISO → local `datetime-local` input value (YYYY-MM-DDTHH:mm).
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const lockedFieldCls =
  'w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800'

export default function ClientPage({
  ctx,
  accounts,
  assets,
}: {
  ctx: EditorContext
  accounts: { id: string; name: string; type: string; linked?: boolean }[]
  assets: { id: string; name: string; type: asset_type }[]
}) {
  const [items, setItems] = useState<LineItemData[]>(
    ctx.prefill_balancing.length > 0
      ? ctx.prefill_balancing.map(b => ({ ...b, datetime: '' }))
      : [
          {
            accounting_head_id: accounts.find(a => !a.linked)?.id ?? '',
            asset_id: assets[0]?.id ?? '',
            quantity: null,
            txn_value: null,
            description: '',
            datetime: '',
          },
        ],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addItem(typeKey: string) {
    const acc = accounts.find(a => a.type === typeKey && !a.linked)
    setItems(prev => [
      { accounting_head_id: acc?.id ?? '', asset_id: assets[0]?.id ?? '', quantity: null, txn_value: null, description: '', datetime: '' },
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
      if (field === 'quantity' && value === null) (copy[idx] as LineItemData).quantity = null
      if (field === 'txn_value' && value === null) (copy[idx] as LineItemData).txn_value = null
      return copy
    })
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const balancing = items
        .filter(it => it.accounting_head_id && it.asset_id)
        .map(it => ({
          accounting_head_id: it.accounting_head_id,
          asset_id: it.asset_id,
          quantity: it.quantity === null || it.quantity === '' ? undefined : Number(it.quantity),
          txn_value: it.txn_value === null || it.txn_value === '' ? null : Number(it.txn_value),
          description: it.description === '' ? null : it.description,
        }))
      const result = ctx.mode === 'revert' ? await revert_request(ctx.link_id, balancing) : await approve_request(ctx.link_id, balancing)
      if (result.success) window.location.href = '/requests'
      else setError(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const lockedItems: LineItemData[] = [
    ...(ctx.reciprocal_head
      ? ctx.mirrored_lines.map(m => ({
          accounting_head_id: ctx.reciprocal_head!.id,
          asset_id: m.asset_id,
          quantity: m.quantity === null ? null : String(m.quantity),
          txn_value: m.txn_value === null ? null : String(m.txn_value),
          description: m.description ?? '',
          datetime: toLocalInput(m.datetime),
        }))
      : []),
    // Lines shared with a different counterparty — locked here; the server
    // preserves them on submit (editing them would need that counterparty's approval).
    ...ctx.other_locked_lines.map(o => ({
      accounting_head_id: o.accounting_head_id,
      asset_id: o.asset_id,
      quantity: o.quantity,
      txn_value: o.txn_value,
      description: o.description,
      datetime: toLocalInput(o.datetime),
    })),
  ]

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/requests"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium mb-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Requests
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          {ctx.mode === 'revert' ? 'Revert to approved' : `Approve request from @${ctx.other_username}`}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          The mirrored lines below are fixed. Add your own balancing lines so the transaction balances in your ledger.
        </p>
      </div>

      {/* Transaction-level details — mirrored from the request, locked */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transaction Details</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Locked
          </span>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date &amp; Time</label>
            <input type="datetime-local" value={toLocalInput(ctx.datetime)} disabled className={lockedFieldCls} />
            {ctx.datetime && (
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic">
                <LocalDateTime value={ctx.datetime} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
            <input type="text" value={ctx.description ?? ''} disabled placeholder="No description" className={lockedFieldCls} />
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <TransactionLineItems
          items={items}
          lockedItems={lockedItems}
          accounts={accounts}
          assets={assets}
          onAddItem={addItem}
          onRemoveItem={removeItem}
          onUpdateItem={updateItem}
        />

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
          <Link
            href="/requests"
            className="px-6 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={busy}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
          >
            {busy ? 'Saving…' : ctx.mode === 'revert' ? 'Revert' : 'Approve'}
          </button>
        </div>
      </form>
    </div>
  )
}
