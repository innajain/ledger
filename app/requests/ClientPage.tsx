'use client'

import { memo, useCallback, useId, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { approve_request, approve_onto_account, approve_keeping_lines, reject_request, accept_all_from } from '@/app/_actions/approvals'
import type { InboxItem, OutboxItem, RequestPreviewLine, RequestSnapshot } from '@/app/_utils/links'
import { LocalDateTime } from '@/app/_components/LocalDateTime'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { EmptyState } from '@/app/_components/EmptyState'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { Button, ButtonLink } from '@/app/_components/Button'
import { CheckCircleIcon } from '@/app/_components/icons'
import { SwipeStack, type SwipeDecision } from './SwipeStack'

const qty_fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

type Tone = 'amber' | 'red' | 'blue' | 'slate' | 'violet'

const TONE_CLS: Record<Tone, string> = {
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

const ACCENT_CLS: Record<Tone, string> = {
  amber: 'border-l-amber-400 dark:border-l-amber-500',
  red: 'border-l-red-400 dark:border-l-red-500',
  blue: 'border-l-blue-400 dark:border-l-blue-500',
  violet: 'border-l-violet-400 dark:border-l-violet-500',
  slate: 'border-l-slate-300 dark:border-l-slate-600',
}

const DOT_CLS: Record<Tone, string> = {
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${TONE_CLS[tone]}`}>{children}</span>
}

type KindInfo = { label: string; tone: Tone }

// One vocabulary for both directions: what *kind* of change the request carries.
function kind_info(kind: 'change' | 'deletion', previous: RequestSnapshot | null, rejected = false): KindInfo {
  if (rejected) return { label: kind === 'deletion' ? 'Deletion rejected' : 'Change rejected', tone: 'red' }
  if (kind === 'deletion') return { label: 'Deletion', tone: 'red' }
  if (previous) return { label: 'Edit', tone: 'violet' }
  return { label: 'New transaction', tone: 'blue' }
}

function line_amount(l: RequestPreviewLine): number {
  return l.txn_value ?? l.quantity ?? 0
}

function net_of(preview: RequestPreviewLine[]): number {
  return preview.reduce((s, p) => s + line_amount(p), 0)
}

function SignedAmount({ value }: { value: number }) {
  const cls = value > 0 ? 'text-green-700 dark:text-green-400' : value < 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
  return <MaskedAmount value={value} keep_sign className={`font-medium tabular-nums ${cls}`} />
}

function LineRow({ line, struck = false }: { line: RequestPreviewLine; struck?: boolean }) {
  return (
    <li className={`flex justify-between gap-4 text-sm ${struck ? 'line-through opacity-70' : ''}`}>
      <span className="text-slate-600 dark:text-slate-400 truncate">{line.asset_name}</span>
      <span className="shrink-0 text-right">
        {line.txn_value !== null && line.quantity !== null && (
          <span className="text-slate-500 dark:text-slate-400 mr-1">{qty_fmt.format(line.quantity)} units ·</span>
        )}
        {line.txn_value === null && line.quantity === null ? '—' : <SignedAmount value={line_amount(line)} />}
      </span>
    </li>
  )
}

/**
 * What the request does to the balance between the two of you, in plain words: a new
 * transaction adds its shared lines, an edit only the difference from the copy you
 * hold, and a deletion takes the lines back out.
 */
function NetEffect({
  preview,
  previous,
  other,
  deletion,
}: {
  preview: RequestPreviewLine[]
  previous: RequestPreviewLine[] | null
  other: string
  deletion: boolean
}) {
  if (preview.length === 0) return null
  const raw = deletion ? -net_of(preview) : net_of(preview) - (previous ? net_of(previous) : 0)
  // Amounts are Decimal(14,4) server-side; round off the float noise the subtraction adds.
  const net = Math.round(raw * 1e4) / 1e4
  const label = deletion ? 'If deleted' : previous ? 'This edit' : 'If approved'
  // Positive on my linked account means the balance between us moves my way.
  const text =
    net === 0 ? 'No change to the balance between you' : `${label}, the balance moves ${net > 0 ? 'in your favour' : `in @${other}’s favour`}`
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-slate-200 dark:border-slate-700 pt-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span>{text}</span>
      {net !== 0 && (
        <span>
          Net <SignedAmount value={net} />
        </span>
      )}
    </p>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  )
}

/** Before → after for an edit, limited to what actually differs. */
function ChangeSummary({ previous, current }: { previous: RequestSnapshot; current: RequestSnapshot }) {
  const dateChanged = previous.datetime !== current.datetime
  const descChanged = (previous.description ?? '') !== (current.description ?? '')
  const linesChanged = JSON.stringify(previous.preview) !== JSON.stringify(current.preview)
  if (!dateChanged && !descChanged && !linesChanged) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Only their own lines changed — nothing shared with you differs.</p>
  }
  return (
    <div className="rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">What changed</p>
      {dateChanged && (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="text-slate-500 dark:text-slate-400">Date: </span>
          <span className="line-through opacity-70">
            <LocalDateTime value={previous.datetime} />
          </span>
          {' → '}
          <LocalDateTime value={current.datetime} />
        </p>
      )}
      {descChanged && (
        <p className="text-sm text-slate-700 dark:text-slate-300">
          <span className="text-slate-500 dark:text-slate-400">Description: </span>
          <span className="line-through opacity-70">{previous.description || 'none'}</span>
          {' → '}
          {current.description || 'none'}
        </p>
      )}
      {linesChanged && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Before</p>
            {previous.preview.length === 0 ? (
              <p className="text-sm italic text-slate-500">none</p>
            ) : (
              <ul className="space-y-0.5">
                {previous.preview.map((l, i) => (
                  <LineRow key={i} line={l} struck />
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">After</p>
            {current.preview.length === 0 ? (
              <p className="text-sm italic text-slate-500">none</p>
            ) : (
              <ul className="space-y-0.5">
                {current.preview.map((l, i) => (
                  <LineRow key={i} line={l} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Shared skeleton for inbox and outbox cards so both read the same way. */
function RequestShell({
  kind,
  headline,
  requested_at,
  description,
  datetime,
  preview,
  account_name,
  other,
  previous,
  deletion = false,
  note,
  actions,
}: {
  kind: KindInfo
  deletion?: boolean
  headline: string
  requested_at: string
  description: string | null
  datetime: string | null
  preview: RequestPreviewLine[]
  account_name: string | null
  other: string
  previous: RequestSnapshot | null
  note?: ReactNode
  actions?: ReactNode
}) {
  const current: RequestSnapshot | null = datetime ? { datetime, description, preview } : null
  return (
    <article
      className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 border-l-4 ${ACCENT_CLS[kind.tone]} p-4 sm:p-5 space-y-4`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Badge tone={kind.tone}>{kind.label}</Badge>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{headline}</p>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Requested <LocalDateTime value={requested_at} />
        </p>
      </header>

      {current ? (
        <dl className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Field label="Description">
            {description ? description : <span className="italic text-slate-500 dark:text-slate-400">No description</span>}
          </Field>
          <Field label="Transaction date">
            <LocalDateTime value={datetime!} />
          </Field>
        </dl>
      ) : (
        <p className="text-sm italic text-slate-500 dark:text-slate-400">Neither copy of this transaction exists any more.</p>
      )}

      {preview.length > 0 && (
        <div className="rounded-md bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Shared lines{account_name ? ` · your “${account_name}” account` : ''}
          </p>
          <ul className="space-y-0.5">
            {preview.map((p, i) => (
              <LineRow key={i} line={p} />
            ))}
          </ul>
          <NetEffect preview={preview} previous={previous?.preview ?? null} other={other} deletion={deletion} />
        </div>
      )}

      {previous && current && <ChangeSummary previous={previous} current={current} />}

      {note}

      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </article>
  )
}

function Note({ tone, children }: { tone: 'amber' | 'slate' | 'red'; children: ReactNode }) {
  const cls =
    tone === 'amber' ? 'text-amber-700 dark:text-amber-400' : tone === 'red' ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'
  return <p className={`text-sm ${cls}`}>{children}</p>
}

// Module-scope + memo: defined inside ClientPage these were remounted (not diffed) for every
// card on each busy/error state change, re-running every LocalDateTime mount effect.
const InboxCard = memo(function InboxCard({
  item,
  busy,
  onRun,
}: {
  item: InboxItem
  busy: boolean
  onRun: (id: string, fn: () => Promise<{ success: boolean; message?: string }>) => void
}) {
  const isRejected = item.status === 'rejected'
  const kind = kind_info(item.kind, item.previous, isRejected)
  const headline = isRejected
    ? `@${item.other_username} rejected your ${item.kind === 'deletion' ? 'deletion' : 'change'}`
    : item.kind === 'deletion'
      ? `@${item.other_username} deleted a shared transaction`
      : item.previous
        ? `@${item.other_username} edited a shared transaction`
        : `@${item.other_username} shared a transaction with you`

  const viewButton = item.my_txn_id && (
    <ButtonLink href={`/transactions/${item.my_txn_id}`} variant="secondary" size="sm">
      View your copy
    </ButtonLink>
  )

  let note: ReactNode = null
  let actions: ReactNode
  if (isRejected) {
    note =
      item.kind === 'deletion' ? (
        <Note tone="red">They kept their copy. Restore yours to match, or leave it deleted and it stays out of sync.</Note>
      ) : (
        <Note tone="red">
          Your ledger and theirs now disagree.{' '}
          {item.can_revert ? 'Revert to their version, or edit / delete your own copy.' : 'Edit or delete your copy to resolve.'}
        </Note>
      )
    actions = (
      <>
        {item.can_revert && item.has_reciprocal && (
          <ButtonLink href={`/requests/${item.link_id}`} variant="primary" size="sm">
            {item.kind === 'deletion' ? 'Restore (undo deletion)' : 'Revert to approved'}
          </ButtonLink>
        )}
        {viewButton}
      </>
    )
  } else if (item.kind === 'deletion') {
    note = <Note tone="slate">They removed their copy. Approving deletes your copy too; rejecting keeps it and tells them you disagree.</Note>
    actions = (
      <>
        <Button onClick={() => onRun(item.link_id, () => approve_request(item.link_id))} disabled={busy} variant="danger" size="sm">
          {busy ? '…' : 'Approve deletion'}
        </Button>
        <Button onClick={() => onRun(item.link_id, () => reject_request(item.link_id))} disabled={busy} variant="secondary" size="sm">
          Reject
        </Button>
        {viewButton}
      </>
    )
  } else {
    note = !item.has_reciprocal ? <Note tone="amber">Link one of your accounts to @{item.other_username} before you can approve this.</Note> : null
    actions = (
      <>
        {item.has_reciprocal && (
          <ButtonLink href={`/requests/${item.link_id}`} variant="primary" size="sm">
            Review &amp; approve
          </ButtonLink>
        )}
        <Button onClick={() => onRun(item.link_id, () => reject_request(item.link_id))} disabled={busy} variant="secondary" size="sm">
          Reject
        </Button>
        {viewButton}
      </>
    )
  }

  return (
    <RequestShell
      kind={kind}
      deletion={!isRejected && item.kind === 'deletion'}
      headline={headline}
      requested_at={item.requested_at}
      description={item.description}
      datetime={item.datetime}
      preview={item.preview}
      account_name={item.account_name}
      other={item.other_username}
      previous={item.previous}
      note={note}
      actions={actions}
    />
  )
})

const OutboxCard = memo(function OutboxCard({ item }: { item: OutboxItem }) {
  const kind = kind_info(item.kind, item.previous)
  const headline =
    item.kind === 'deletion'
      ? `You deleted this — waiting on @${item.other_username}`
      : item.previous
        ? `You edited this — waiting on @${item.other_username}`
        : `You shared this — waiting on @${item.other_username}`

  return (
    <RequestShell
      kind={{ ...kind, tone: 'slate' }}
      deletion={item.kind === 'deletion'}
      headline={headline}
      requested_at={item.requested_at}
      description={item.description}
      datetime={item.datetime}
      preview={item.preview}
      account_name={item.account_name}
      other={item.other_username}
      previous={item.previous}
      actions={
        item.my_txn_id && (
          <ButtonLink href={`/transactions/${item.my_txn_id}`} variant="secondary" size="sm">
            View your copy
          </ButtonLink>
        )
      }
    />
  )
})

/** Groups keep first-seen order, so each person's newest request decides where they sit. */
function group_by_other<T extends { other_id: string; other_username: string }>(items: T[]): { other_id: string; username: string; items: T[] }[] {
  const m = new Map<string, { other_id: string; username: string; items: T[] }>()
  for (const it of items) {
    const g = m.get(it.other_id) ?? { other_id: it.other_id, username: it.other_username, items: [] }
    g.items.push(it)
    m.set(it.other_id, g)
  }
  return Array.from(m.values())
}

function Section({ id, title, count, hint, children }: { id: string; title: string; count: number; hint: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="space-y-3 scroll-mt-20">
      <div>
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
          <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {count}
          </span>
        </h2>
        <p className="hidden sm:block text-sm text-slate-500 dark:text-slate-400">{hint}</p>
      </div>
      {children}
    </section>
  )
}

function PersonGroup({ username, count, children }: { username: string; count: number; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        @{username} <span className="font-normal text-slate-500 dark:text-slate-400">· {count}</span>
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function StatTile({ href, label, count, tone }: { href: string; label: string; count: number; tone: Tone }) {
  const active = count > 0
  return (
    <a
      href={href}
      aria-disabled={!active}
      className={`rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 transition-colors ${
        active
          ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
          : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 pointer-events-none opacity-60'
      }`}
    >
      <p className="truncate text-[11px] sm:text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {count}
        {active && <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLS[tone]}`} aria-hidden="true" />}
      </p>
    </a>
  )
}

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
  const [swipeAccountId, setSwipeAccountId] = useState<string | undefined>(defaultAccountId ?? accounts[0]?.id)
  const swipeAccount = accounts.find(a => a.id === swipeAccountId) ?? null

  const commitSwipe = useCallback(
    async (item: InboxItem, decision: SwipeDecision) => {
      setError(null)
      try {
        if (decision === 'reject') return await reject_request(item.link_id)
        if (item.kind === 'deletion') return await approve_request(item.link_id)
        if (item.previous) {
          const r = await approve_keeping_lines(item.link_id)
          // The dry run passed when the page loaded; this only fails if something changed since.
          return r.success ? r : { ...r, message: `${r.message} — open Review & approve to adjust your lines.` }
        }
        if (!swipeAccount) return { success: false, message: 'Pick an account to balance with' }
        return await approve_onto_account(item.link_id, swipeAccount.id)
      } catch (e) {
        return { success: false, message: e instanceof Error ? e.message : String(e) }
      }
    },
    [swipeAccount],
  )

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

  const renderInbox = (list: InboxItem[]) =>
    group_by_other(list).map(g => (
      <PersonGroup key={g.other_id} username={g.username} count={g.items.length}>
        {g.items.map(item => (
          <InboxCard key={item.link_id} item={item} busy={busyId === item.link_id} onRun={run} />
        ))}
      </PersonGroup>
    ))

  // Rendered twice — above the list on wide screens, folded under the deck on phones — so
  // control ids carry a suffix.
  const renderAcceptAll = (suffix: string) => (
    <div className="space-y-3">
      <div>
        {suffix === 'wide' && <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Accept all at once</p>}
        {accounts.length === 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Create one of your own accounts (e.g. “Cash”) to bulk-approve these against — a linked account can’t be the balancing account.
          </p>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Approves every new or edited request from a person, balanced onto one of your accounts (an account-to-account transfer you can reclassify
            later). Deletions are not included.
          </p>
        )}
      </div>
      {accounts.length > 0 &&
        changeGroups.map(([otherId, g]) => (
          <div key={otherId} className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <strong>@{g.username}</strong> — {g.count} request{g.count === 1 ? '' : 's'}
            </span>
            <label htmlFor={`${uid}-balance-${suffix}-${otherId}`} className="text-sm text-slate-500 dark:text-slate-400">
              balance with
            </label>
            <select
              id={`${uid}-balance-${suffix}-${otherId}`}
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
    </div>
  )

  return (
    <div className="space-y-5 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Requests</h1>
        {/* Phones skip the explainer so the first card sits near the top of the screen. */}
        <p className="hidden sm:block text-slate-600 dark:text-slate-400 mt-1">
          Transactions on an account linked to someone else are kept in both ledgers. Each change, edit or deletion waits here until the other side
          agrees.
        </p>
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
          {/* On phones only the sections below the deck get a jump link — To approve is already on screen. */}
          {(rejected.length > 0 || outbox.length > 0) && (
            <nav aria-label="Other requests" className="sm:hidden flex flex-wrap gap-2 -mt-2">
              {rejected.length > 0 && (
                <a href="#needs-action" className={`rounded-full px-3 py-1 text-sm font-medium ${TONE_CLS.red}`}>
                  {rejected.length} rejected ↓
                </a>
              )}
              {outbox.length > 0 && (
                <a href="#awaiting-others" className={`rounded-full px-3 py-1 text-sm font-medium ${TONE_CLS.slate}`}>
                  {outbox.length} awaiting others ↓
                </a>
              )}
            </nav>
          )}
          <nav aria-label="Request summary" className="hidden sm:grid grid-cols-3 gap-3">
            <StatTile href="#to-approve" label="To approve" count={pending.length} tone="amber" />
            <StatTile href="#needs-action" label="Rejected" count={rejected.length} tone="red" />
            <StatTile href="#awaiting-others" label="Awaiting" count={outbox.length} tone="slate" />
          </nav>

          {pending.length > 0 && (
            <Section
              id="to-approve"
              title="To approve"
              count={pending.length}
              hint="Someone changed a transaction you share. Nothing moves in your ledger until you approve."
            >
              {changeGroups.length > 0 && (
                <div className="hidden sm:block rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-4">
                  {renderAcceptAll('wide')}
                </div>
              )}
              {/* Phones get a swipe deck; wider screens keep the full grouped list. */}
              <div className="sm:hidden space-y-3">
                {accounts.length > 0 && pending.some(i => i.kind === 'change' && !i.previous) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <label htmlFor={`${uid}-swipe-account`} className="text-slate-500 dark:text-slate-400">
                      New transactions balance with
                    </label>
                    <select
                      id={`${uid}-swipe-account`}
                      value={swipeAccountId}
                      onChange={e => setSwipeAccountId(e.target.value)}
                      className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <SwipeStack
                  items={pending}
                  account={swipeAccount}
                  renderCard={item => <InboxCard item={item} busy={busyId === item.link_id} onRun={run} />}
                  onCommit={commitSwipe}
                  onError={setError}
                />
                {changeGroups.length > 0 && (
                  <details className="group rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Accept all at once
                      <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-180">
                        ▾
                      </span>
                    </summary>
                    <div className="px-4 pb-4">{renderAcceptAll('narrow')}</div>
                  </details>
                )}
              </div>
              <div className="hidden sm:block space-y-3">{renderInbox(pending)}</div>
            </Section>
          )}

          {rejected.length > 0 && (
            <Section
              id="needs-action"
              title="Needs your action"
              count={rejected.length}
              hint="The other side rejected something you did, so your copies disagree. Bring them back in line."
            >
              {renderInbox(rejected)}
            </Section>
          )}

          {outbox.length > 0 && (
            <Section
              id="awaiting-others"
              title="Awaiting others"
              count={outbox.length}
              hint="Requests you sent that the other person hasn’t acted on yet."
            >
              {group_by_other(outbox).map(g => (
                <PersonGroup key={g.other_id} username={g.username} count={g.items.length}>
                  {g.items.map(item => (
                    <OutboxCard key={item.link_id} item={item} />
                  ))}
                </PersonGroup>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
