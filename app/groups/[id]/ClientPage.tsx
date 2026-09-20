'use client'

import React, { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/app/_components/Card'
import { Button } from '@/app/_components/Button'
import { ChevronLeftIcon, PencilIcon, TrashIcon, CloseIcon } from '@/app/_components/icons'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { EmptyState } from '@/app/_components/EmptyState'
import { GroupEmptyIcon } from '@/app/_components/EmptyStateIcons'
import { useToast } from '@/app/_components/Toast'
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { update_transaction_group, delete_transaction_group, remove_transactions_from_group } from '@/app/_actions/groups'

type GroupTransaction = {
  id: string
  datetime: string
  description: string | null
  is_future: boolean
  is_due: boolean
  net: number
}

type Group = {
  id: string
  name: string
  description: string | null
  summary: { count: number; future_count: number; inflow: number; outflow: number; net: number }
  transactions: GroupTransaction[]
}

const IST = 'Asia/Kolkata'
const datetime_fmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const up_ampm = (s: string) => s.replace(/\b(am|pm)\b/g, m => m.toUpperCase())

// Every figure here is a signed flow in the ledger's own convention — money out
// negative, money in positive and green — so the group summary reads the same way
// as a row on the transactions list.
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${value > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'}`}>
        <MaskedAmount value={value} keep_sign />
      </p>
    </div>
  )
}

export default function ClientPage({ group }: { group: Group }) {
  const router = useRouter()
  const uid = useId()
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await update_transaction_group(group.id, { name, description: description || null })
      if (!res.success) {
        setError(res.message)
        return
      }
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    const count = group.summary.count + group.summary.future_count
    const detail = count === 0 ? '' : ` Its ${count} transaction${count === 1 ? '' : 's'} will stay exactly as they are — only the label goes.`
    if (!confirm(`Delete the group “${group.name}”?${detail}`)) return
    setError(null)
    setBusy(true)
    try {
      const res = await delete_transaction_group(group.id)
      if (!res.success) {
        setError(res.message)
        setBusy(false)
        return
      }
      router.push('/groups')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  async function onRemove(transaction_id: string) {
    setError(null)
    setRemoving(transaction_id)
    try {
      const res = await remove_transactions_from_group(group.id, [transaction_id])
      if (!res.success) {
        setError(res.message)
        return
      }
      showToast('Removed from the group', 'success')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/groups"
        className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium"
      >
        <ChevronLeftIcon />
        Groups
      </Link>

      <Card className="p-6">
        {editing ? (
          <form onSubmit={onSave} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-name`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Name
              </label>
              <input
                id={`${uid}-name`}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-description`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Description <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <input
                id={`${uid}-description`}
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setName(group.name)
                  setDescription(group.description ?? '')
                  setEditing(false)
                  setError(null)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy || name.trim() === ''}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 break-words">{group.name}</h1>
                {group.description && <p className="text-slate-600 dark:text-slate-400 mt-1">{group.description}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)} size="sm">
                  <PencilIcon />
                  Edit
                </Button>
                <Button variant="dangerOutline" onClick={onDelete} disabled={busy} size="sm">
                  <TrashIcon />
                  Delete
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
              <Stat label="Net" value={group.summary.net} />
              <Stat label="Money out" value={-group.summary.outflow} />
              <Stat label="Money in" value={group.summary.inflow} />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Transactions</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{group.summary.count}</p>
                {group.summary.future_count > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">+ {group.summary.future_count} scheduled, not counted above</p>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Link href={`/transactions?groupId=${group.id}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Open in Transactions, with the usual filters →
              </Link>
            </div>
          </>
        )}
      </Card>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {group.transactions.length === 0 ? (
        <EmptyState
          icon={<GroupEmptyIcon />}
          title="Nothing in this group yet"
          description="Add a transaction to this group from its edit page, or pick the group while posting a new one."
          actionUrl="/transactions/create"
          actionLabel="New transaction"
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">In this group</h2>
          </div>
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {group.transactions.map(t => (
              <li key={t.id} className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <div className="flex-1 min-w-0">
                  <Link href={`/transactions/${t.id}`} className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate hover:underline">
                    {t.description || 'No description'}
                  </Link>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{up_ampm(datetime_fmt.format(new Date(t.datetime)))}</p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  {t.is_future && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                      {t.is_due ? 'Due' : 'Scheduled'}
                    </span>
                  )}
                  {t.net !== 0 ? (
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        t.net > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      <MaskedAmount value={t.net} keep_sign />
                    </span>
                  ) : (
                    <span className="text-lg font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{currency_fmt.format(0)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void onRemove(t.id)}
                    disabled={removing === t.id}
                    aria-label={`Remove “${t.description || 'this transaction'}” from ${group.name}`}
                    title="Remove from this group"
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-50 transition-colors"
                  >
                    <CloseIcon className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
