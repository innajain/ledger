import 'server-only'
import { cache } from 'react'
import { Prisma } from '@/generated/prisma/client'
import type { transaction_link, accounting_head, asset } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { validate_line_items } from './validate_line_items'
import { assert_no_locked_lines, find_locked_line } from './lock_date'
import { toDecimal } from './decimal'
import { ActionError } from '@/app/_actions/_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export function other_user(link: transaction_link, user_id: string): string {
  return link.user_a_id === user_id ? link.user_b_id : link.user_a_id
}
export function my_txn_id(link: transaction_link, user_id: string): string | null {
  return link.user_a_id === user_id ? link.txn_a_id : link.txn_b_id
}
export function their_txn_id(link: transaction_link, user_id: string): string | null {
  return link.user_a_id === user_id ? link.txn_b_id : link.txn_a_id
}

async function reciprocal_head(tx: Tx, owner_id: string, other_user_id: string): Promise<{ id: string } | null> {
  return tx.accounting_head.findFirst({
    where: { user_id: owner_id, linked_user_id: other_user_id, type: 'account' },
    select: { id: true },
  })
}

export async function linked_counterparties(tx: Tx, transaction_id: string): Promise<string[]> {
  const lines = await tx.line_item.findMany({
    where: { transaction_id },
    select: { accounting_head: { select: { linked_user_id: true } } },
  })
  return Array.from(new Set(lines.map(l => l.accounting_head.linked_user_id).filter((x): x is string => !!x)))
}

// Both sides' content signatures in one read: my copy's shared lines sit on heads
// linked to the counterparty, theirs on heads linked back to me. One findMany over the
// two transaction ids halves the in-transaction round trips per counterparty.
async function linked_signature_pair(
  tx: Tx,
  user_id: string,
  my_txn: string,
  their_txn: string,
  cp: string,
): Promise<{ mine: string; theirs: string }> {
  const rows = await tx.transaction.findMany({
    where: { id: { in: [my_txn, their_txn] } },
    select: {
      id: true,
      description: true,
      datetime: true,
      line_items: {
        where: { accounting_head: { linked_user_id: { in: [user_id, cp] } } },
        select: {
          asset_id: true,
          quantity: true,
          txn_value: true,
          description: true,
          datetime: true,
          accounting_head: { select: { linked_user_id: true } },
        },
      },
    },
  })
  const sig = (txn: (typeof rows)[number] | undefined, linked_user_id: string, negate: boolean) => {
    if (!txn) return ''
    const flip = (d: Prisma.Decimal | null) => (d === null ? 'x' : (negate ? d.neg() : d).toString())
    const lineSig = txn.line_items
      .filter(l => l.accounting_head.linked_user_id === linked_user_id)
      .map(l => `${l.asset_id}:${flip(l.quantity)}:${flip(l.txn_value)}:${l.description ?? ''}:${l.datetime ? l.datetime.toISOString() : ''}`)
      .sort()
      .join('|')
    return `T:${txn.description ?? ''}:${txn.datetime.toISOString()}||${lineSig}`
  }
  return {
    mine: sig(
      rows.find(r => r.id === my_txn),
      cp,
      false,
    ),
    theirs: sig(
      rows.find(r => r.id === their_txn),
      user_id,
      true,
    ),
  }
}

type SourceTxn = Prisma.transactionGetPayload<{ include: { line_items: { include: { accounting_head: true } } } }>

// Loop-invariant rows a caller approving many links from one counterparty can fetch
// once (accept_all_from): heads/assets are supersets — coverage is re-checked per link
// and any gap falls back to the normal per-link query.
export type BuildActorCopyPrefetch = {
  recip?: { id: string } | null
  source?: SourceTxn
  heads?: accounting_head[]
  assets?: asset[]
}

export type ActorCopyTouched = {
  mine: { head_ids: Set<string>; asset_ids: Set<string> }
  theirs: { head_ids: Set<string>; asset_ids: Set<string> }
}

export async function build_actor_copy(
  tx: Tx,
  link: transaction_link,
  actor_id: string,
  balancing: CreateLineItemInput[],
  auto_balance_account_id?: string,
  prefetch?: BuildActorCopyPrefetch,
): Promise<ActorCopyTouched> {
  const other_id = other_user(link, actor_id)
  const recip = prefetch?.recip !== undefined ? prefetch.recip : await reciprocal_head(tx, actor_id, other_id)
  if (!recip) throw new ActionError('VALIDATION', 'Link an account back to that user before approving')

  const source_txn_id = their_txn_id(link, actor_id)
  if (!source_txn_id) throw new ActionError('NOT_FOUND', 'No counterpart transaction to mirror')

  const source =
    prefetch?.source ??
    (await tx.transaction.findUnique({
      where: { id: source_txn_id },
      include: { line_items: { include: { accounting_head: true } } },
    }))
  if (!source) throw new ActionError('NOT_FOUND', 'Counterpart transaction not found')

  const seed: CreateLineItemInput[] = source.line_items
    .filter(li => li.accounting_head.linked_user_id === actor_id)
    .map(li => ({
      accounting_head_id: recip.id,
      asset_id: li.asset_id,
      quantity: li.quantity === null ? undefined : li.quantity.neg().toNumber(),
      txn_value: li.txn_value === null ? null : li.txn_value.neg().toNumber(),

      description: li.description ?? null,
      datetime: li.datetime ?? null,
    }))
  if (seed.length === 0) throw new ActionError('VALIDATION', 'The counterpart transaction has no linked line items to mirror')

  if (auto_balance_account_id) {
    const sums = new Map<string, { q: Prisma.Decimal; tv: Prisma.Decimal | null }>()
    for (const li of source.line_items) {
      if (li.accounting_head.linked_user_id !== actor_id) continue
      const cur = sums.get(li.asset_id) ?? { q: new Prisma.Decimal(0), tv: null }
      cur.q = cur.q.add(li.quantity ?? 0)
      if (li.txn_value !== null) cur.tv = (cur.tv ?? new Prisma.Decimal(0)).add(li.txn_value)
      sums.set(li.asset_id, cur)
    }
    balancing = []
    for (const [asset_id, { q, tv }] of sums) {
      if (q.isZero() && (tv === null || tv.isZero())) continue
      balancing.push({
        accounting_head_id: auto_balance_account_id,
        asset_id,
        quantity: q.toNumber(),
        txn_value: tv === null ? null : tv.toNumber(),
        description: null,
      })
    }
  }

  const my_txn = my_txn_id(link, actor_id)
  // One read serves both the preserved-lines derivation and the lock assertion below,
  // and its head/asset ids feed the returned invalidation set (the old copy's lines can
  // sit on heads absent from the rebuilt copy).
  const current = my_txn
    ? await tx.transaction.findUnique({
        where: { id: my_txn },
        select: {
          datetime: true,
          line_items: {
            select: {
              accounting_head_id: true,
              asset_id: true,
              quantity: true,
              txn_value: true,
              description: true,
              datetime: true,
              accounting_head: { select: { name: true, lock_date: true, linked_user_id: true } },
            },
          },
        },
      })
    : null

  let preserved: CreateLineItemInput[] = []
  if (!auto_balance_account_id && current) {
    preserved = current.line_items
      .filter(li => li.accounting_head.linked_user_id !== null && li.accounting_head_id !== recip.id)
      .map(li => ({
        accounting_head_id: li.accounting_head_id,
        asset_id: li.asset_id,
        quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
        txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
        description: li.description ?? null,
        datetime: li.datetime ?? null,
      }))
  }

  const all_lines = [...seed, ...balancing, ...preserved]

  const head_ids = Array.from(new Set(all_lines.map(l => l.accounting_head_id)))
  const asset_ids = Array.from(new Set(all_lines.map(l => l.asset_id)))
  let heads: accounting_head[]
  if (prefetch?.heads && head_ids.every(id => prefetch.heads!.some(h => h.id === id))) {
    heads = prefetch.heads.filter(h => head_ids.includes(h.id))
  } else {
    heads = await tx.accounting_head.findMany({ where: { id: { in: head_ids }, user_id: actor_id } })
  }
  if (heads.length !== head_ids.length) throw new ActionError('VALIDATION', 'One or more of your accounts were not found')
  let assets: asset[]
  if (prefetch?.assets && asset_ids.every(id => prefetch.assets!.some(a => a.id === id))) {
    assets = prefetch.assets.filter(a => asset_ids.includes(a.id))
  } else {
    assets = await tx.asset.findMany({ where: { id: { in: asset_ids } } })
  }
  if (assets.length !== asset_ids.length) throw new ActionError('VALIDATION', 'One or more assets were not found')

  const { is_valid, message } = validate_line_items(
    all_lines.map(li => ({
      quantity: toDecimal(li.quantity),
      txn_value: toDecimal(li.txn_value),
      asset: assets.find(a => a.id === li.asset_id)!,
      accounting_head: heads.find(a => a.id === li.accounting_head_id)!,
    })),
  )
  if (!is_valid) throw new ActionError('VALIDATION', message)

  // the actor's reconciliation lock also gates approval-driven rewrites — both
  // the rebuilt copy and whatever it replaces must be outside every lock
  assert_no_locked_lines(
    'apply this request to',
    source.datetime,
    all_lines.map(li => ({ datetime: li.datetime, accounting_head: heads.find(h => h.id === li.accounting_head_id)! })),
  )
  if (current) assert_no_locked_lines('apply this request to', current.datetime, current.line_items)

  const data_lines = all_lines.map(li => ({
    quantity: toDecimal(li.quantity),
    txn_value: toDecimal(li.txn_value),
    accounting_head_id: li.accounting_head_id,
    asset_id: li.asset_id,
    description: li.description ?? null,
    datetime: li.datetime ?? null,
  }))

  let actor_txn_id: string
  if (my_txn) {
    await tx.line_item.deleteMany({ where: { transaction_id: my_txn } })
    await tx.transaction.update({
      where: { id: my_txn },
      data: { datetime: source.datetime, description: source.description, line_items: { create: data_lines } },
    })
    actor_txn_id = my_txn
  } else {
    const created = await tx.transaction.create({
      data: { user_id: actor_id, datetime: source.datetime, description: source.description, line_items: { create: data_lines } },
    })
    actor_txn_id = created.id
  }

  const isA = link.user_a_id === actor_id
  await tx.transaction_link.update({
    where: { id: link.id },
    data: {
      pending_status: 'approved',
      pending_by: null,
      pending_kind: null,
      ...(isA ? { txn_a_id: actor_txn_id } : { txn_b_id: actor_txn_id }),
    },
  })

  // Auto-balance onto a non-linked head: the rebuilt copy's only counterparty is this
  // link's, just marked approved with content mirrored sign-flipped from the source —
  // the propagate sync is a no-op by construction, so skip its queries. Any other shape
  // (manual balancing, or a linked balancing head) keeps the full sync.
  const balancing_head = auto_balance_account_id ? heads.find(h => h.id === auto_balance_account_id) : undefined
  if (!(auto_balance_account_id && balancing_head?.linked_user_id === null)) {
    const counterparties = Array.from(new Set(heads.map(h => h.linked_user_id).filter((x): x is string => !!x)))
    await sync_links_after_update(tx, actor_id, actor_txn_id, { propagate: true, counterparties })
  }

  const mine_heads = new Set(all_lines.map(l => l.accounting_head_id))
  const mine_assets = new Set(all_lines.map(l => l.asset_id))
  if (current) {
    for (const li of current.line_items) {
      mine_heads.add(li.accounting_head_id)
      mine_assets.add(li.asset_id)
    }
  }
  return {
    mine: { head_ids: mine_heads, asset_ids: mine_assets },
    theirs: {
      head_ids: new Set(source.line_items.map(li => li.accounting_head_id)),
      asset_ids: new Set(source.line_items.map(li => li.asset_id)),
    },
  }
}

// counterparties: pass the linked users of the transaction's heads when the caller
// already holds the head rows — skips re-reading the just-written line items, making
// this a free no-op for the common unlinked-transaction create.
export async function create_links_for_transaction(tx: Tx, user_id: string, transaction_id: string, counterparties?: string[]): Promise<string[]> {
  counterparties ??= await linked_counterparties(tx, transaction_id)
  for (const cp of counterparties) {
    await tx.transaction_link.create({
      data: {
        user_a_id: user_id,
        user_b_id: cp,
        txn_a_id: transaction_id,
        pending_status: 'pending',
        pending_kind: 'change',
        pending_by: cp,
      },
    })
  }
  return counterparties
}

export async function backfill_links_for_account(tx: Tx, user_id: string, head_id: string, counterparty_id: string): Promise<number> {
  const rows = await tx.line_item.findMany({
    where: { accounting_head_id: head_id, transaction: { user_id } },
    select: { transaction_id: true },
    distinct: ['transaction_id'],
  })
  const txnIds = rows.map(r => r.transaction_id)
  if (txnIds.length === 0) return 0

  const existing = await tx.transaction_link.findMany({
    where: { txn_a_id: { in: txnIds }, user_b_id: counterparty_id },
    select: { txn_a_id: true },
  })
  const already = new Set(existing.map(e => e.txn_a_id))

  const toCreate = txnIds.filter(tid => !already.has(tid))
  if (toCreate.length === 0) return 0
  // One batched insert instead of a round trip per historical transaction — this runs
  // inside the interactive $transaction that links an account with existing history.
  // skipDuplicates leans on @@unique([txn_a_id, user_b_id]) to stay race-safe.
  const { count } = await tx.transaction_link.createMany({
    data: toCreate.map(tid => ({
      user_a_id: user_id,
      user_b_id: counterparty_id,
      txn_a_id: tid,
      pending_status: 'pending' as const,
      pending_kind: 'change' as const,
      pending_by: counterparty_id,
    })),
    skipDuplicates: true,
  })
  return count
}

async function links_owned_by(tx: Tx, user_id: string, transaction_id: string): Promise<transaction_link[]> {
  return tx.transaction_link.findMany({
    where: {
      OR: [
        { user_a_id: user_id, txn_a_id: transaction_id },
        { user_b_id: user_id, txn_b_id: transaction_id },
      ],
    },
  })
}

// opts.counterparties: same contract as create_links_for_transaction — the linked users
// of the transaction's current heads, when the caller already holds the head rows.
// Returns the counterparty ids whose link this call created or set pending, so callers
// can notify without re-querying the link table after commit.
export async function sync_links_after_update(
  tx: Tx,
  user_id: string,
  transaction_id: string,
  opts: { propagate?: boolean; counterparties?: string[] } = {},
): Promise<string[]> {
  const current = opts.counterparties ?? (await linked_counterparties(tx, transaction_id))
  const existing = await links_owned_by(tx, user_id, transaction_id)
  const reopened: string[] = []

  if (!opts.propagate) {
    for (const link of existing) {
      const cp = other_user(link, user_id)
      if (!current.includes(cp)) {
        throw new ActionError('VALIDATION', 'Removing the shared portion of a linked transaction isn’t supported — delete the transaction instead')
      }
    }
  }

  for (const cp of current) {
    const link = existing.find(l => other_user(l, user_id) === cp)
    if (!link) {
      await tx.transaction_link.create({
        data: { user_a_id: user_id, user_b_id: cp, txn_a_id: transaction_id, pending_status: 'pending', pending_kind: 'change', pending_by: cp },
      })
      reopened.push(cp)
      continue
    }

    if (opts.propagate) {
      if (link.pending_status !== 'approved') continue
    } else {
      if (link.pending_status === 'pending' && link.pending_by === user_id) {
        throw new ActionError('VALIDATION', 'Resolve the pending request from this counterparty before editing the shared lines')
      }
    }

    const counterpart_txn = their_txn_id(link, user_id)
    if (counterpart_txn) {
      const { mine, theirs } = await linked_signature_pair(tx, user_id, transaction_id, counterpart_txn, cp)
      if (mine === theirs && link.pending_status === 'approved') continue
    }

    await tx.transaction_link.update({
      where: { id: link.id },
      data: { pending_status: 'pending', pending_kind: 'change', pending_by: cp },
    })
    reopened.push(cp)
  }
  return reopened
}

export type RequestPreviewLine = { asset_name: string; quantity: number | null; txn_value: number | null }

/** One copy of a shared transaction, reduced to its shared lines in the viewer's frame. */
export type RequestSnapshot = { datetime: string; description: string | null; preview: RequestPreviewLine[] }

export type InboxItem = {
  link_id: string
  status: 'pending' | 'rejected'
  kind: 'change' | 'deletion'
  other_id: string
  other_username: string

  preview: RequestPreviewLine[]
  has_reciprocal: boolean

  can_revert: boolean
  datetime: string | null
  description: string | null

  my_txn_id: string | null
  /** When the request was raised (or last re-opened). */
  requested_at: string
  /** Name of my account head linked to them — where the shared lines land in my ledger. */
  account_name: string | null
  /**
   * For a pending change to a transaction I already hold: my copy as it stands, so the
   * card can say what the change actually does. Null for a brand-new transaction, a
   * deletion, or a rejection.
   */
  previous: RequestSnapshot | null
  /**
   * For a pending edit: whether approving it with my own lines kept as they are passes a dry
   * run (see plan_keep_lines_approval). When false, it needs the review page.
   */
  keeps_lines_ok?: boolean
}

type SnapshotTxn = {
  id: string
  datetime: Date
  description: string | null
  line_items: {
    quantity: Prisma.Decimal | null
    txn_value: Prisma.Decimal | null
    accounting_head: { linked_user_id: string | null }
    asset: { name: string }
  }[]
}

const snapshot_select = {
  id: true,
  datetime: true,
  description: true,
  line_items: {
    select: { quantity: true, txn_value: true, accounting_head: { select: { linked_user_id: true } }, asset: { select: { name: true } } },
  },
} as const

// A copy's shared lines are the ones on the head linked to the *other* owner. My copy is
// already in my frame; theirs is mirrored, so it is sign-flipped back into mine.
function snapshot(txn: SnapshotTxn, linked_to: string, flip: boolean): RequestSnapshot {
  return {
    datetime: txn.datetime.toISOString(),
    description: txn.description,
    preview: txn.line_items
      .filter(li => li.accounting_head.linked_user_id === linked_to)
      .map(li => ({
        asset_name: li.asset.name,
        quantity: li.quantity === null ? null : (flip ? li.quantity.neg() : li.quantity).toNumber(),
        txn_value: li.txn_value === null ? null : (flip ? li.txn_value.neg() : li.txn_value).toNumber(),
      })),
  }
}

async function load_request_context(user_id: string, links: transaction_link[]) {
  const otherIds = Array.from(new Set(links.map(l => other_user(l, user_id))))
  // Both copies of every link: a deletion request has only one surviving copy, and an
  // edit needs the untouched copy to show what changed.
  const txnIds = links.flatMap(l => [l.txn_a_id, l.txn_b_id]).filter((id): id is string => id !== null)
  const [users, recips, txns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } }),
    prisma.accounting_head.findMany({
      where: { user_id, linked_user_id: { in: otherIds }, type: 'account' },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      select: { linked_user_id: true, name: true },
    }),
    prisma.transaction.findMany({ where: { id: { in: txnIds } }, select: snapshot_select }),
  ])
  const accountByOther = new Map<string, string>()
  for (const r of recips) if (r.linked_user_id && !accountByOther.has(r.linked_user_id)) accountByOther.set(r.linked_user_id, r.name)
  return {
    nameById: new Map(users.map(u => [u.id, u.username])),
    accountByOther,
    txnById: new Map(txns.map(t => [t.id, t as SnapshotTxn])),
  }
}

export async function get_inbox(user_id: string): Promise<InboxItem[]> {
  const links = await prisma.transaction_link.findMany({ where: { pending_by: user_id }, orderBy: { updated_at: 'desc' } })
  if (links.length === 0) return []

  const { nameById, accountByOther, txnById } = await load_request_context(user_id, links)

  const items: InboxItem[] = []
  for (const link of links) {
    const other = other_user(link, user_id)
    const sourceTxnId = their_txn_id(link, user_id)
    const myTxnId = my_txn_id(link, user_id)
    const theirs = sourceTxnId ? txnById.get(sourceTxnId) : undefined
    const mine = myTxnId ? txnById.get(myTxnId) : undefined
    const kind = (link.pending_kind ?? 'change') as 'change' | 'deletion'
    const status = link.pending_status as 'pending' | 'rejected'

    // The request is described by their copy. A deletion request has none — they deleted
    // it — so it falls back to my surviving copy, which is the one approving would remove.
    const current = theirs ? snapshot(theirs, user_id, true) : mine ? snapshot(mine, other, false) : null
    const previous = status === 'pending' && kind === 'change' && theirs && mine ? snapshot(mine, other, false) : null

    items.push({
      link_id: link.id,
      status,
      kind,
      other_id: other,
      other_username: nameById.get(other) ?? 'unknown',
      preview: current?.preview ?? [],
      has_reciprocal: accountByOther.has(other),
      can_revert: link.pending_status === 'rejected' && sourceTxnId !== null,
      datetime: current?.datetime ?? null,
      description: current?.description ?? null,
      my_txn_id: myTxnId,
      requested_at: link.updated_at.toISOString(),
      account_name: accountByOther.get(other) ?? null,
      previous,
    })
  }
  // Dry-run each pending edit up front, so the swipe deck knows before the swipe whether a
  // right swipe can approve it as-is. Edits are few, and each check is read-only.
  await Promise.all(
    items
      .filter(i => i.status === 'pending' && i.kind === 'change' && i.previous)
      .map(async i => {
        i.keeps_lines_ok = (await plan_keep_lines_approval(user_id, i.link_id)).ok
      }),
  )
  return items
}

export async function inbox_count(user_id: string): Promise<number> {
  return prisma.transaction_link.count({ where: { pending_by: user_id } })
}

export type OutboxItem = {
  link_id: string
  kind: 'change' | 'deletion'
  other_id: string
  other_username: string

  preview: RequestPreviewLine[]

  my_txn_id: string | null
  datetime: string | null
  description: string | null
  requested_at: string
  account_name: string | null
  /** Their copy as it stands, when my change edits a transaction they already hold. */
  previous: RequestSnapshot | null
}

export async function get_outbox(user_id: string): Promise<OutboxItem[]> {
  const links = await prisma.transaction_link.findMany({
    where: {
      pending_status: 'pending',
      pending_by: { not: user_id },
      OR: [{ user_a_id: user_id }, { user_b_id: user_id }],
    },
    orderBy: { updated_at: 'desc' },
  })
  if (links.length === 0) return []

  const { nameById, accountByOther, txnById } = await load_request_context(user_id, links)

  const items: OutboxItem[] = []
  for (const link of links) {
    const other = other_user(link, user_id)
    const myTxnId = my_txn_id(link, user_id)
    const theirTxnId = their_txn_id(link, user_id)
    const mine = myTxnId ? txnById.get(myTxnId) : undefined
    const theirs = theirTxnId ? txnById.get(theirTxnId) : undefined
    const kind = (link.pending_kind ?? 'change') as 'change' | 'deletion'

    // A deletion I asked for has already removed my copy, so describe theirs — the one
    // the request would remove.
    const current = mine ? snapshot(mine, other, false) : theirs ? snapshot(theirs, user_id, true) : null
    const previous = kind === 'change' && mine && theirs ? snapshot(theirs, user_id, true) : null

    items.push({
      link_id: link.id,
      kind,
      other_id: other,
      other_username: nameById.get(other) ?? 'unknown',
      preview: current?.preview ?? [],
      my_txn_id: myTxnId,
      datetime: current?.datetime ?? null,
      description: current?.description ?? null,
      requested_at: link.updated_at.toISOString(),
      account_name: accountByOther.get(other) ?? null,
      previous,
    })
  }
  return items
}

// One request-deduped fetch of a transaction's links plus counterparty names —
// get_transaction_status and get_cancellable_links render on the same page, and the
// cancellable set is a pure subset of the full link list.
const get_links_with_names = cache(async (user_id: string, transaction_id: string) => {
  const links = await prisma.transaction_link.findMany({
    where: {
      OR: [
        { user_a_id: user_id, txn_a_id: transaction_id },
        { user_b_id: user_id, txn_b_id: transaction_id },
      ],
    },
  })
  if (links.length === 0) return { links, nameById: new Map<string, string>() }
  const otherIds = Array.from(new Set(links.map(l => other_user(l, user_id))))
  const users = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } })
  return { links, nameById: new Map(users.map(u => [u.id, u.username])) }
})

export async function get_cancellable_links(user_id: string, transaction_id: string): Promise<{ link_id: string; other_username: string }[]> {
  const { links, nameById } = await get_links_with_names(user_id, transaction_id)
  return links
    .filter(l => l.pending_status === 'pending' && l.pending_by !== user_id)
    .map(l => ({ link_id: l.id, other_username: nameById.get(other_user(l, user_id)) ?? 'user' }))
}

export type TransactionStatus = { text: string; severity: 'success' | 'warning' | 'error' | 'info' }

export async function get_transaction_status(user_id: string, transaction_id: string): Promise<TransactionStatus | null> {
  const { links, nameById } = await get_links_with_names(user_id, transaction_id)
  if (links.length === 0) return null
  const name = (id: string) => nameById.get(id) ?? 'user'
  const tag = (l: (typeof links)[number]) => '@' + name(other_user(l, user_id))

  const awaitingMe = links.filter(l => l.pending_status === 'pending' && l.pending_by === user_id)
  const awaitingThem = links.filter(l => l.pending_status === 'pending' && l.pending_by !== user_id)
  const rejectedMine = links.filter(l => l.pending_status === 'rejected' && l.pending_by === user_id)
  const rejectedTheirs = links.filter(l => l.pending_status === 'rejected' && l.pending_by !== user_id)

  const parts: string[] = []
  if (awaitingMe.length) parts.push(`awaiting your approval (${awaitingMe.map(tag).join(', ')}) — see Requests`)
  if (awaitingThem.length) parts.push(`awaiting approval from ${awaitingThem.map(tag).join(', ')}`)
  if (rejectedMine.length) parts.push(`your change was rejected by ${rejectedMine.map(tag).join(', ')} — resolve in Requests`)
  if (rejectedTheirs.length) parts.push(`awaiting ${rejectedTheirs.map(tag).join(', ')} to resolve a rejected change`)

  const severity: TransactionStatus['severity'] = rejectedMine.length
    ? 'error'
    : awaitingMe.length
      ? 'warning'
      : awaitingThem.length || rejectedTheirs.length
        ? 'info'
        : 'success'

  const text =
    parts.length === 0
      ? `Shared with ${Array.from(new Set(links.map(l => other_user(l, user_id))))
          .map(id => '@' + name(id))
          .join(', ')} (approved)`
      : `Shared transaction — ${parts.join('; ')}`

  return { text, severity }
}

type SharedLine = {
  asset_id: string
  asset_name: string
  asset_type: string
  quantity: number | null
  txn_value: number | null
  description: string | null
  datetime: string | null
}

export type EditorContext = {
  link_id: string
  mode: 'approve' | 'revert'
  other_username: string
  reciprocal_head: { id: string; name: string } | null

  mirrored_lines: SharedLine[]

  prefill_balancing: { accounting_head_id: string; asset_id: string; quantity: string | null; txn_value: string | null; description: string }[]

  other_locked_lines: {
    accounting_head_id: string
    asset_id: string
    quantity: string | null
    txn_value: string | null
    description: string
    datetime: string | null
  }[]
  datetime: string | null
  description: string | null

  previous: { datetime: string | null; description: string | null; mirrored_lines: SharedLine[] } | null
}

export async function get_editor_context(user_id: string, link_id: string): Promise<EditorContext | null> {
  const link = await prisma.transaction_link.findUnique({ where: { id: link_id } })
  if (!link || link.pending_by !== user_id) return null

  if (link.pending_status === 'pending' && link.pending_kind === 'deletion') return null

  const other = other_user(link, user_id)
  const sourceTxnId = their_txn_id(link, user_id)
  const myTxnId = my_txn_id(link, user_id)
  const [otherUser, recip, src, mine] = await Promise.all([
    prisma.user.findUnique({ where: { id: other }, select: { username: true } }),
    prisma.accounting_head.findFirst({
      where: { user_id, linked_user_id: other, type: 'account' },
      select: { id: true, name: true },
    }),
    sourceTxnId
      ? prisma.transaction.findUnique({
          where: { id: sourceTxnId },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        })
      : null,
    myTxnId
      ? prisma.transaction.findUnique({
          where: { id: myTxnId },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        })
      : null,
  ])

  let mirrored: EditorContext['mirrored_lines'] = []
  let datetime: string | null = null
  let description: string | null = null
  if (src) {
    datetime = src.datetime.toISOString()
    description = src.description
    mirrored = src.line_items
      .filter(li => li.accounting_head.linked_user_id === user_id)
      .map(li => ({
        asset_id: li.asset_id,
        asset_name: li.asset.name,
        asset_type: li.asset.type,
        quantity: li.quantity === null ? null : li.quantity.neg().toNumber(),
        txn_value: li.txn_value === null ? null : li.txn_value.neg().toNumber(),
        description: li.description ?? null,
        datetime: li.datetime ? li.datetime.toISOString() : null,
      }))
  }

  const prefill: EditorContext['prefill_balancing'] = []
  const otherLocked: EditorContext['other_locked_lines'] = []
  let previous: EditorContext['previous'] = null
  if (recip) {
    if (mine) {
      const prevLines: SharedLine[] = []
      for (const li of mine.line_items) {
        if (li.accounting_head_id === recip.id) {
          prevLines.push({
            asset_id: li.asset_id,
            asset_name: li.asset.name,
            asset_type: li.asset.type,
            quantity: li.quantity === null ? null : li.quantity.toNumber(),
            txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
            description: li.description ?? null,
            datetime: li.datetime ? li.datetime.toISOString() : null,
          })
          continue
        }
        const row = {
          accounting_head_id: li.accounting_head_id,
          asset_id: li.asset_id,
          quantity: li.quantity === null ? null : li.quantity.toString(),
          txn_value: li.txn_value === null ? null : li.txn_value.toString(),
          description: li.description ?? '',
        }
        if (li.accounting_head.linked_user_id !== null) {
          otherLocked.push({ ...row, datetime: li.datetime ? li.datetime.toISOString() : null })
        } else {
          prefill.push(row)
        }
      }
      previous = { datetime: mine.datetime.toISOString(), description: mine.description, mirrored_lines: prevLines }
    }
  }

  return {
    link_id: link.id,
    mode: link.pending_status === 'rejected' ? 'revert' : 'approve',
    other_username: otherUser?.username ?? 'unknown',
    reciprocal_head: recip,
    mirrored_lines: mirrored,
    prefill_balancing: prefill,
    other_locked_lines: otherLocked,
    datetime,
    description,
    previous,
  }
}

export async function prepare_links_for_delete(tx: Tx, user_id: string, transaction_id: string): Promise<void> {
  const links = await links_owned_by(tx, user_id, transaction_id)
  for (const link of links) {
    const counterpart_txn = their_txn_id(link, user_id)
    const isA = link.user_a_id === user_id
    if (!counterpart_txn) {
      await tx.transaction_link.delete({ where: { id: link.id } })
    } else {
      await tx.transaction_link.update({
        where: { id: link.id },
        data: {
          pending_status: 'pending',
          pending_kind: 'deletion',
          pending_by: other_user(link, user_id),
          ...(isA ? { txn_a_id: null } : { txn_b_id: null }),
        },
      })
    }
  }
}

export type KeepLinesPlan = { ok: true; balancing: CreateLineItemInput[] } | { ok: false; reason: string }

/**
 * Plan approving an edit while keeping my own lines (what the review page submits untouched),
 * and dry-run it — the same validation and reconciliation-lock check a real approval does,
 * without writing. One explicit line on one of my accounts per asset (a typical settle-up)
 * can't absorb a changed shared amount the way a null remainder does, so it is re-sized to the
 * new shared total — the figure auto-balance would book. The swipe deck uses `ok` to decide
 * whether a right swipe approves or opens the review page.
 */
export async function plan_keep_lines_approval(user_id: string, link_id: string, ctx?: EditorContext | null): Promise<KeepLinesPlan> {
  const c = ctx === undefined ? await get_editor_context(user_id, link_id) : ctx
  if (!c) return { ok: false, reason: 'This request is not awaiting your approval' }
  if (!c.reciprocal_head) return { ok: false, reason: 'Link an account back to that user before approving' }
  if (c.prefill_balancing.length === 0) return { ok: false, reason: 'You have no lines of your own on this transaction yet' }

  const balancing: CreateLineItemInput[] = c.prefill_balancing.map(b => ({
    accounting_head_id: b.accounting_head_id,
    asset_id: b.asset_id,
    quantity: b.quantity === null || b.quantity === '' ? undefined : Number(b.quantity),
    txn_value: b.txn_value === null || b.txn_value === '' ? null : Number(b.txn_value),
    description: b.description === '' ? null : b.description,
  }))
  const locked_lines = [
    ...c.mirrored_lines.map(m => ({
      accounting_head_id: c.reciprocal_head!.id,
      asset_id: m.asset_id,
      quantity: m.quantity,
      txn_value: m.txn_value,
      datetime: m.datetime,
    })),
    ...c.other_locked_lines.map(o => ({
      accounting_head_id: o.accounting_head_id,
      asset_id: o.asset_id,
      quantity: o.quantity === null ? null : Number(o.quantity),
      txn_value: o.txn_value === null ? null : Number(o.txn_value),
      datetime: o.datetime,
    })),
  ]

  const head_ids = [...new Set([...balancing, ...locked_lines].map(l => l.accounting_head_id))]
  const asset_ids = [...new Set([...balancing, ...locked_lines].map(l => l.asset_id))]
  const [heads, assets] = await Promise.all([
    prisma.accounting_head.findMany({ where: { id: { in: head_ids }, user_id } }),
    prisma.asset.findMany({ where: { id: { in: asset_ids } } }),
  ])
  const headById = new Map(heads.map(h => [h.id, h]))
  const assetById = new Map(assets.map(a => [a.id, a]))
  if (headById.size !== head_ids.length || assetById.size !== asset_ids.length)
    return { ok: false, reason: 'A line refers to an account you no longer have' }

  for (const asset_id of asset_ids) {
    const mine = balancing.filter(b => b.asset_id === asset_id)
    const only = mine[0]
    if (mine.length !== 1 || only.quantity === undefined || only.txn_value !== null || headById.get(only.accounting_head_id)?.type !== 'account')
      continue
    const shared = locked_lines.filter(l => l.asset_id === asset_id).map(l => l.quantity)
    if (shared.some(q => q === null)) continue
    only.quantity = shared
      .reduce<Prisma.Decimal>((sum, q) => sum.add(q!), new Prisma.Decimal(0))
      .neg()
      .toNumber()
  }

  const datetime = c.datetime ? new Date(c.datetime) : new Date()
  const all = [
    ...locked_lines.map(l => ({ ...l, datetime: l.datetime ? new Date(l.datetime) : null })),
    ...balancing.map(b => ({ ...b, datetime: null })),
  ]
  const lock = find_locked_line(
    datetime,
    all.map(l => ({ datetime: l.datetime, accounting_head: headById.get(l.accounting_head_id)! })),
  )
  if (lock) return { ok: false, reason: `"${lock.head_name}" is reconciled and locked for that date` }

  const { is_valid, message } = validate_line_items(
    all.map(l => ({
      quantity: toDecimal(l.quantity ?? null),
      txn_value: toDecimal(l.txn_value ?? null),
      asset: assetById.get(l.asset_id)!,
      accounting_head: headById.get(l.accounting_head_id)!,
    })),
  )
  if (!is_valid) return { ok: false, reason: message ?? 'Your lines no longer balance' }
  return { ok: true, balancing }
}
