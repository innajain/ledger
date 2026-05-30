'use client'

import { useState } from 'react'
import Link from 'next/link'
import { approve_request, reject_request } from '@/app/_actions/approvals'
import type { InboxItem } from '@/app/_utils/links'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { ErrorAlert } from '@/app/_components/AccountFormComponents'
import { EmptyState } from '@/app/_components/EmptyState'

function PreviewLines({ preview }: { preview: InboxItem['preview'] }) {
  if (preview.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
      {preview.map((p, i) => (
        <li key={i} className="flex justify-between gap-4">
          <span>{p.asset_name}</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {p.txn_value !== null ? `${p.quantity ?? '—'} (₹${p.txn_value})` : `₹${p.quantity ?? '—'}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ClientPage({ items }: { items: InboxItem[] }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id)
    setError(null)
    try {
      const r = await fn()
      if (!r.success) setError(r.message ?? 'Action failed')
      else window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const pending = items.filter(i => i.status === 'pending')
  const rejected = items.filter(i => i.status === 'rejected')

  function Card({ item }: { item: InboxItem }) {
    const busy = busyId === item.link_id
    const isRejected = item.status === 'rejected'
    const headline = isRejected
      ? `@${item.other_username} rejected your ${item.kind === 'deletion' ? 'deletion' : 'change'}`
      : item.kind === 'deletion'
        ? `@${item.other_username} wants to delete a shared transaction`
        : `@${item.other_username} sent a transaction for your approval`

    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{headline}</p>
            {item.description && <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 italic">{item.description}</p>}
            {item.datetime && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <LocalDateTime value={item.datetime} />
              </p>
            )}
            <PreviewLines preview={item.preview} />
          </div>
        </div>

        {!item.has_reciprocal && item.kind === 'change' && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            Link an account back to @{item.other_username} before you can approve this.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {isRejected ? (
            <>
              {item.has_reciprocal && (
                <Link
                  href={`/requests/${item.link_id}`}
                  className="px-4 py-1.5 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 font-medium"
                >
                  Revert to approved
                </Link>
              )}
              <span className="text-sm text-slate-500 dark:text-slate-400 self-center">or edit / delete your own transaction.</span>
            </>
          ) : item.kind === 'deletion' ? (
            <>
              <button
                onClick={() => run(item.link_id, () => approve_request(item.link_id))}
                disabled={busy}
                className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50"
              >
                {busy ? '…' : 'Approve deletion'}
              </button>
              <button
                onClick={() => run(item.link_id, () => reject_request(item.link_id))}
                disabled={busy}
                className="px-4 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 font-medium disabled:opacity-50"
              >
                Reject
              </button>
            </>
          ) : (
            <>
              {item.has_reciprocal && (
                <Link
                  href={`/requests/${item.link_id}`}
                  className="px-4 py-1.5 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 font-medium"
                >
                  Review &amp; Approve
                </Link>
              )}
              <button
                onClick={() => run(item.link_id, () => reject_request(item.link_id))}
                disabled={busy}
                className="px-4 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 font-medium disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Requests</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Approve, reject, or resolve shared transactions.</p>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {items.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl">✅</span>}
          title="Nothing awaiting you"
          description="Approval requests from linked accounts will show up here."
        />
      ) : (
        <>
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">To approve</h2>
              {pending.map(item => (
                <Card key={item.link_id} item={item} />
              ))}
            </section>
          )}
          {rejected.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Needs your action</h2>
              {rejected.map(item => (
                <Card key={item.link_id} item={item} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
