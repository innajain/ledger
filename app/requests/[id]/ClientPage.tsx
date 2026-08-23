'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { asset_type } from '@/generated/prisma/enums'
import { approve_request, revert_request } from '@/app/_actions/approvals'
import { TransactionLineItems, TransactionBalanceSummary, LineItemData, new_line_uid } from '@/app/_components/TransactionLineItems'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { Button, ButtonLink } from '@/app/_components/Button'
import { ChevronLeftIcon, LockIcon } from '@/app/_components/icons'
import type { EditorContext } from '@/app/_utils/links'
import type { LineItemDefaults } from '@/app/_actions/preferences'
import { pickDefaultAccount, pickDefaultAsset, type AccountTypeKey } from '@/app/_utils/line_item_defaults'

type SharedLine = NonNullable<EditorContext['previous']>['mirrored_lines'][number]

function fmtLine(l: SharedLine): string {
  const qty = l.quantity === null ? '—' : l.quantity < 0 ? `-₹${Math.abs(l.quantity)}` : `₹${l.quantity}`
  if (l.asset_type === 'rupees') return qty
  const val = l.txn_value === null ? '—' : `₹${l.txn_value}`
  return `${l.quantity ?? '—'} units · book ${val}`
}

function DiffCard({ ctx }: { ctx: EditorContext }) {
  const prev = ctx.previous
  if (!prev || ctx.mode === 'revert') return null

  const dateChanged = prev.datetime !== ctx.datetime
  const descChanged = (prev.description ?? '') !== (ctx.description ?? '')
  const linesChanged = JSON.stringify(prev.mirrored_lines) !== JSON.stringify(ctx.mirrored_lines)

  if (!dateChanged && !descChanged && !linesChanged) return null

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-6 space-y-4">
      <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">Proposed changes</h2>

      {dateChanged && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Date &amp; Time</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-sm text-red-800 dark:text-red-300 line-through">
              {prev.datetime ? <LocalDateTime value={prev.datetime} /> : '—'}
            </div>
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2 text-sm text-green-800 dark:text-green-300">
              {ctx.datetime ? <LocalDateTime value={ctx.datetime} /> : '—'}
            </div>
          </div>
        </div>
      )}

      {descChanged && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 text-sm text-red-800 dark:text-red-300 line-through italic">
              {prev.description || 'No description'}
            </div>
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2 text-sm text-green-800 dark:text-green-300 italic">
              {ctx.description || 'No description'}
            </div>
          </div>
        </div>
      )}

      {linesChanged && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Shared lines</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2 space-y-1">
              {prev.mirrored_lines.length === 0 ? (
                <p className="text-xs text-red-500 dark:text-red-400 italic">none</p>
              ) : (
                prev.mirrored_lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2 text-sm text-red-800 dark:text-red-300 line-through">
                    <span className="truncate">{l.asset_name}</span>
                    <span className="shrink-0 font-medium">{fmtLine(l)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2 space-y-1">
              {ctx.mirrored_lines.length === 0 ? (
                <p className="text-xs text-green-500 dark:text-green-400 italic">none</p>
              ) : (
                ctx.mirrored_lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-2 text-sm text-green-800 dark:text-green-300">
                    <span className="truncate">{l.asset_name}</span>
                    <span className="shrink-0 font-medium">{fmtLine(l)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-0.5">
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">Before</p>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500">After</p>
          </div>
        </div>
      )}
    </div>
  )
}

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
  defaults,
}: {
  ctx: EditorContext
  accounts: { id: string; name: string; type: string; linked?: boolean }[]
  assets: { id: string; name: string; type: asset_type }[]
  defaults: LineItemDefaults
}) {
  const router = useRouter()

  const ownAccounts = accounts.filter(a => !a.linked)
  const defaultAsset = pickDefaultAsset(assets, defaults)

  function defaultItemForType(typeKey: AccountTypeKey): LineItemData {
    const acc = pickDefaultAccount(ownAccounts, defaults, typeKey)
    return {
      uid: new_line_uid(),
      accounting_head_id: acc?.id ?? '',
      asset_id: defaultAsset?.id ?? assets[0]?.id ?? '',
      quantity: null,
      txn_value: null,
      description: '',
      datetime: '',
    }
  }

  const [items, setItems] = useState<LineItemData[]>(
    ctx.prefill_balancing.length > 0
      ? ctx.prefill_balancing.map(b => ({ ...b, uid: new_line_uid(), datetime: '' }))
      : [defaultItemForType('account')],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addItem(typeKey: string) {
    setItems(prev => [defaultItemForType(typeKey as AccountTypeKey), ...prev])
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
      if (result.success) {
        router.push('/requests')
      } else setError(result.message)
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
          <ChevronLeftIcon className="w-5 h-5" />
          Requests
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
          {ctx.mode === 'revert' ? 'Revert to approved' : `Approve request from @${ctx.other_username}`}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          The mirrored lines below are fixed. Add your own balancing lines so the transaction balances in your ledger.
        </p>
      </div>

      <DiffCard ctx={ctx} />

      {}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transaction Details</h2>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <LockIcon className="w-3.5 h-3.5" />
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

        <TransactionBalanceSummary items={items} lockedItems={lockedItems} accounts={accounts} assets={assets} />

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
          <ButtonLink href="/requests" variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" disabled={busy} variant="primary">
            {busy ? 'Saving…' : ctx.mode === 'revert' ? 'Revert' : 'Approve'}
          </Button>
        </div>
      </form>
    </div>
  )
}
