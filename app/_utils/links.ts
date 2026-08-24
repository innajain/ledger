import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { transaction_link, accounting_head, asset } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { validate_line_items } from './validate_line_items'
import { assert_no_locked_lines } from './lock_date'
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

async function linked_signature(tx: Tx, transaction_id: string, linked_user_id: string, negate: boolean): Promise<string> {
  const txn = await tx.transaction.findUnique({
    where: { id: transaction_id },
    select: {
      description: true,
      datetime: true,
      line_items: {
        where: { accounting_head: { linked_user_id } },
        select: { asset_id: true, quantity: true, txn_value: true, description: true, datetime: true },
      },
    },
  })
  if (!txn) return ''
  const flip = (d: Prisma.Decimal | null) => (d === null ? 'x' : (negate ? d.neg() : d).toString())
  const lineSig = txn.line_items
    .map(l => `${l.asset_id}:${flip(l.quantity)}:${flip(l.txn_value)}:${l.description ?? ''}:${l.datetime ? l.datetime.toISOString() : ''}`)
    .sort()
    .join('|')
  return `T:${txn.description ?? ''}:${txn.datetime.toISOString()}||${lineSig}`
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
      const mine = await linked_signature(tx, transaction_id, cp, false)
      const theirs = await linked_signature(tx, counterpart_txn, user_id, true)
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

export type InboxItem = {
  link_id: string
  status: 'pending' | 'rejected'
  kind: 'change' | 'deletion'
  other_id: string
  other_username: string

  preview: { asset_name: string; quantity: number | null; txn_value: number | null }[]
  has_reciprocal: boolean

  can_revert: boolean
  datetime: string | null
  description: string | null

  my_txn_id: string | null
}

export async function get_inbox(user_id: string): Promise<InboxItem[]> {
  const links = await prisma.transaction_link.findMany({ where: { pending_by: user_id }, orderBy: { updated_at: 'desc' } })
  if (links.length === 0) return []

  const otherIds = Array.from(new Set(links.map(l => other_user(l, user_id))))
  const sourceIds = links.map(l => their_txn_id(l, user_id)).filter((id): id is string => id !== null)
  const [users, recips, sourceTxns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } }),
    prisma.accounting_head.findMany({
      where: { user_id, linked_user_id: { in: otherIds }, type: 'account' },
      select: { linked_user_id: true },
    }),
    prisma.transaction.findMany({
      where: { id: { in: sourceIds } },
      select: {
        id: true,
        datetime: true,
        description: true,
        line_items: {
          select: { quantity: true, txn_value: true, accounting_head: { select: { linked_user_id: true } }, asset: { select: { name: true } } },
        },
      },
    }),
  ])
  const nameById = new Map(users.map(u => [u.id, u.username]))
  const hasRecip = new Set(recips.map(r => r.linked_user_id))
  const srcById = new Map(sourceTxns.map(t => [t.id, t]))

  const items: InboxItem[] = []
  for (const link of links) {
    const other = other_user(link, user_id)
    const sourceTxnId = their_txn_id(link, user_id)
    let preview: InboxItem['preview'] = []
    let datetime: string | null = null
    let description: string | null = null
    const src = sourceTxnId ? srcById.get(sourceTxnId) : undefined
    if (src) {
      datetime = src.datetime.toISOString()
      description = src.description
      preview = src.line_items
        .filter(li => li.accounting_head.linked_user_id === user_id)
        .map(li => ({
          asset_name: li.asset.name,
          quantity: li.quantity === null ? null : li.quantity.neg().toNumber(),
          txn_value: li.txn_value === null ? null : li.txn_value.neg().toNumber(),
        }))
    }
    items.push({
      link_id: link.id,
      status: link.pending_status as 'pending' | 'rejected',
      kind: (link.pending_kind ?? 'change') as 'change' | 'deletion',
      other_id: other,
      other_username: nameById.get(other) ?? 'unknown',
      preview,
      has_reciprocal: hasRecip.has(other),
      can_revert: link.pending_status === 'rejected' && sourceTxnId !== null,
      datetime,
      description,
      my_txn_id: my_txn_id(link, user_id),
    })
  }
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

  preview: { asset_name: string; quantity: number | null; txn_value: number | null }[]

  my_txn_id: string | null
  datetime: string | null
  description: string | null
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

  const otherIds = Array.from(new Set(links.map(l => other_user(l, user_id))))
  const myIds = links.map(l => my_txn_id(l, user_id)).filter((id): id is string => id !== null)
  const [users, myTxns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } }),
    prisma.transaction.findMany({
      where: { id: { in: myIds } },
      select: {
        id: true,
        datetime: true,
        description: true,
        line_items: {
          select: { quantity: true, txn_value: true, accounting_head: { select: { linked_user_id: true } }, asset: { select: { name: true } } },
        },
      },
    }),
  ])
  const nameById = new Map(users.map(u => [u.id, u.username]))
  const myTxnById = new Map(myTxns.map(t => [t.id, t]))

  const items: OutboxItem[] = []
  for (const link of links) {
    const other = other_user(link, user_id)
    const myTxnId = my_txn_id(link, user_id)
    let preview: OutboxItem['preview'] = []
    let datetime: string | null = null
    let description: string | null = null
    const mine = myTxnId ? myTxnById.get(myTxnId) : undefined
    if (mine) {
      datetime = mine.datetime.toISOString()
      description = mine.description
      preview = mine.line_items
        .filter(li => li.accounting_head.linked_user_id === other)
        .map(li => ({
          asset_name: li.asset.name,
          quantity: li.quantity === null ? null : li.quantity.toNumber(),
          txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
        }))
    }
    items.push({
      link_id: link.id,
      kind: (link.pending_kind ?? 'change') as 'change' | 'deletion',
      other_id: other,
      other_username: nameById.get(other) ?? 'unknown',
      preview,
      my_txn_id: myTxnId,
      datetime,
      description,
    })
  }
  return items
}

export async function get_cancellable_links(user_id: string, transaction_id: string): Promise<{ link_id: string; other_username: string }[]> {
  const links = await prisma.transaction_link.findMany({
    where: {
      pending_status: 'pending',
      pending_by: { not: user_id },
      OR: [
        { user_a_id: user_id, txn_a_id: transaction_id },
        { user_b_id: user_id, txn_b_id: transaction_id },
      ],
    },
  })
  if (links.length === 0) return []
  const otherIds = Array.from(new Set(links.map(l => other_user(l, user_id))))
  const users = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } })
  const name = (id: string) => users.find(u => u.id === id)?.username ?? 'user'
  return links.map(l => ({ link_id: l.id, other_username: name(other_user(l, user_id)) }))
}

export type TransactionStatus = { text: string; severity: 'success' | 'warning' | 'error' | 'info' }

export async function get_transaction_status(user_id: string, transaction_id: string): Promise<TransactionStatus | null> {
  const links = await prisma.transaction_link.findMany({
    where: {
      OR: [
        { user_a_id: user_id, txn_a_id: transaction_id },
        { user_b_id: user_id, txn_b_id: transaction_id },
      ],
    },
  })
  if (links.length === 0) return null
  const otherIds = Array.from(new Set(links.map(l => other_user(l, user_id))))
  const users = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } })
  const name = (id: string) => users.find(u => u.id === id)?.username ?? 'user'
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
    parts.length === 0 ? `Shared with ${otherIds.map(id => '@' + name(id)).join(', ')} (approved)` : `Shared transaction — ${parts.join('; ')}`

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
