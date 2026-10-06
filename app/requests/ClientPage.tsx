'use client'

import { memo, useCallback, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { approve_request, reject_request, accept_all_from } from '@/app/_actions/approvals'
import type { InboxItem, OutboxItem } from '@/app/_utils/links'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { EmptyState } from '@/app/_components/EmptyState'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { Button, ButtonLink } from '@/app/_components/Button'
import { CloseIcon, CheckCircleIcon } from '@/app/_components/icons'

const qty_fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

function PreviewLines({ preview }: { preview: { asset_name: string; quantity: number | null; txn_value: number | null }[] }) {
  if (preview.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
      {preview.map((p, i) => (
        <li key={i} className="flex justify-between gap-4">
          <span>{p.asset_name}</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {p.txn_value !== null ? (
              <>
                {p.quantity !== null ? `${qty_fmt.format(p.quantity)} units ` : ''}(<MaskedAmount value={p.txn_value} />)
              </>
            ) : p.quantity !== null ? (
              <MaskedAmount value={p.quantity} />
            ) : (
              '—'
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

// Module-scope + memo: defined inside ClientPage these were remounted (not diffed) for every
// card on each busy/error state change, re-running every LocalDateTime mount effect.
const Card = memo(function Card({
  item,
  busy,
  onRun,
}: {
  item: InboxItem
  busy: boolean
  onRun: (id: string, fn: () => Promise<{ success: boolean; message?: string }>) => void
}) {
  const isRejected = item.status === 'rejected'
  const headline = isRejected
    ? `@${item.other_username} rejected your ${item.kind === 'deletion' ? 'deletion' : 'change'}`
    : item.kind === 'deletion'
      ? `@${item.other_username} wants to delete a shared transaction`
      : `@${item.other_username} sent a transaction for your approval`

  const borderAccent = isRejected ? 'border-l-4 border-l-red-400 dark:border-l-red-500' : 'border-l-4 border-l-amber-400 dark:border-l-amber-500'

  const badge = isRejected ? (
    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
      <CloseIcon className="w-3 h-3" />
      Rejected
    </span>
  ) : (
    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
      <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Needs approval
    </span>
  )

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 ${borderAccent} p-4 sm:p-6`}>
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
        {badge}
      </div>

      {!item.has_reciprocal && item.kind === 'change' && (
        <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">Link an account back to @{item.other_username} before you can approve this.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {isRejected ? (
          <>
            {item.can_revert && item.has_reciprocal && (
              <ButtonLink href={`/requests/${item.link_id}`} variant="primary" size="sm">
                {item.kind === 'deletion' ? 'Restore (undo deletion)' : 'Revert to approved'}
              </ButtonLink>
            )}
            {item.my_txn_id && (
              <ButtonLink href={`/transactions/${item.my_txn_id}`} variant="secondary" size="sm">
                View transaction
              </ButtonLink>
            )}
            {item.kind !== 'deletion' && !item.my_txn_id && (
              <span className="text-sm text-slate-500 dark:text-slate-400 self-center">
                {item.can_revert ? 'or edit / delete your own transaction.' : 'Edit or delete your transaction to resolve.'}
              </span>
            )}
          </>
        ) : item.kind === 'deletion' ? (
          <>
            {item.my_txn_id && (
              <ButtonLink href={`/transactions/${item.my_txn_id}`} variant="secondary" size="sm">
                View transaction
              </ButtonLink>
            )}
            <Button onClick={() => onRun(item.link_id, () => approve_request(item.link_id))} disabled={busy} variant="danger" size="sm">
              {busy ? '…' : 'Approve deletion'}
            </Button>
            <Button onClick={() => onRun(item.link_id, () => reject_request(item.link_id))} disabled={busy} variant="secondary" size="sm">
              Reject
            </Button>
          </>
        ) : (
          <>
            {item.has_reciprocal && (
              <ButtonLink href={`/requests/${item.link_id}`} variant="primary" size="sm">
                Review &amp; approve
              </ButtonLink>
            )}
            <Button onClick={() => onRun(item.link_id, () => reject_request(item.link_id))} disabled={busy} variant="secondary" size="sm">
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  )
})

const OutboxCard = memo(function OutboxCard({ item }: { item: OutboxItem }) {
  const headline =
    item.kind === 'deletion' ? `You asked @${item.other_username} to approve a deletion` : `Waiting on @${item.other_username} to approve your change`

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6">
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
        {/* No status chip here: the section header and the headline already say this is waiting on them. */}
      </div>

      {item.my_txn_id && (
        <div className="mt-4">
          <ButtonLink href={`/transactions/${item.my_txn_id}`} variant="secondary" size="sm">
            View transaction
          </ButtonLink>
        </div>
      )}
    </div>
  )
})

export default function ClientPage({
  items,
  outbox = [],
  accounts,
  defaultAccountId,
}: {
  items: InboxItem[]
  outbox?: OutboxItem[]
  accounts: { id: string; name: string }[]
  defaultAccountId?: string
}) {
  const router = useRouter()
  const uid = useId()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [balancingByOther, setBalancingByOther] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  async function bulkAccept(otherId: string) {
    const acct = balancingByOther[otherId] ?? defaultAccountId ?? accounts[0]?.id
    if (!acct) {
      setError('Add an account first to balance with')
      return
    }
    setBulkBusy(otherId)
    setError(null)
    try {
      const r = await accept_all_from(otherId, acct)
      if (!r.success) setError(r.message ?? "Couldn't approve these requests")
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBulkBusy(null)
    }
  }

  const run = useCallback(
    async (id: string, fn: () => Promise<{ success: boolean; message?: string }>) => {
      setBusyId(id)
      setError(null)
      try {
        const r = await fn()
        if (!r.success) setError(r.message ?? "Couldn't update this request")
        else router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusyId(null)
      }
    },
    [router],
  )

  const pending = items.filter(i => i.status === 'pending')
  const rejected = items.filter(i => i.status === 'rejected')

  const changeGroups = Array.from(
    pending
      .filter(i => i.kind === 'change' && i.has_reciprocal)
      .reduce((m, i) => {
        const g = m.get(i.other_id) ?? { username: i.other_username, count: 0 }
        g.count++
        m.set(i.other_id, g)
        return m
      }, new Map<string, { username: string; count: number }>()),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Requests</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Approve, reject, or resolve shared transactions.</p>
      </div>

      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {items.length === 0 && outbox.length === 0 ? (
        <EmptyState
          icon={<CheckCircleIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />}
          title="Nothing awaiting you"
          description="Approval requests from linked accounts will show up here."
        />
      ) : (
        <>
          {changeGroups.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Accept all</h2>
              {accounts.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Create one of your own accounts (e.g. “Cash”) to bulk-approve these against — a linked account can’t be the balancing account.
                </p>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Bulk-approve every pending request from someone, auto-balanced onto one of your accounts (creates an account-to-account transfer you
                  can reclassify later).
                </p>
              )}
              {accounts.length > 0 &&
                changeGroups.map(([otherId, g]) => (
                  <div
                    key={otherId}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex flex-wrap items-center gap-3"
                  >
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      <strong>@{g.username}</strong> — {g.count} request{g.count === 1 ? '' : 's'}
                    </span>
                    <label htmlFor={`${uid}-balance-${otherId}`} className="text-sm text-slate-500 dark:text-slate-400">
                      balance with
                    </label>
                    <select
                      id={`${uid}-balance-${otherId}`}
                      value={balancingByOther[otherId] ?? defaultAccountId ?? accounts[0].id}
                      onChange={e => setBalancingByOther(prev => ({ ...prev, [otherId]: e.target.value }))}
                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => bulkAccept(otherId)} disabled={bulkBusy === otherId} variant="primary" size="sm" className="ml-auto">
                      {bulkBusy === otherId ? 'Approving…' : `Accept all ${g.count}`}
                    </Button>
                  </div>
                ))}
            </section>
          )}
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">To approve</h2>
              {pending.map(item => (
                <Card key={item.link_id} item={item} busy={busyId === item.link_id} onRun={run} />
              ))}
            </section>
          )}
          {rejected.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Needs your action</h2>
              {rejected.map(item => (
                <Card key={item.link_id} item={item} busy={busyId === item.link_id} onRun={run} />
              ))}
            </section>
          )}
          {outbox.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Awaiting others</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Requests you sent that the other person hasn’t acted on yet.</p>
              {outbox.map(item => (
                <OutboxCard key={item.link_id} item={item} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
