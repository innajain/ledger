import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import type { transaction_link } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { validate_line_items } from './validate_line_items'
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

export async function build_actor_copy(
  tx: Tx,
  link: transaction_link,
  actor_id: string,
  balancing: CreateLineItemInput[],
  auto_balance_account_id?: string,
): Promise<void> {
  const other_id = other_user(link, actor_id)
  const recip = await reciprocal_head(tx, actor_id, other_id)
  if (!recip) throw new ActionError('VALIDATION', 'Link an account back to that user before approving')

  const source_txn_id = their_txn_id(link, actor_id)
  if (!source_txn_id) throw new ActionError('NOT_FOUND', 'No counterpart transaction to mirror')

  const source = await tx.transaction.findUnique({
    where: { id: source_txn_id },
    include: { line_items: { include: { accounting_head: true } } },
  })
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
  let preserved: CreateLineItemInput[] = []
  if (!auto_balance_account_id && my_txn) {
    const others = await tx.line_item.findMany({
      where: { transaction_id: my_txn, accounting_head: { linked_user_id: { not: null } }, NOT: { accounting_head_id: recip.id } },
      select: { accounting_head_id: true, asset_id: true, quantity: true, txn_value: true, description: true, datetime: true },
    })
    preserved = others.map(li => ({
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
  const heads = await tx.accounting_head.findMany({ where: { id: { in: head_ids }, user_id: actor_id } })
  if (heads.length !== head_ids.length) throw new ActionError('VALIDATION', 'One or more of your accounts were not found')
  const assets = await tx.asset.findMany({ where: { id: { in: asset_ids } } })
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

  const data_lines = all_lines.map(li => ({
    quantity: toDecimal(li.quantity),
    txn_value: toDecimal(li.txn_value),
    accounting_head_id: li.accounting_head_id,
    asset_id: li.asset_id,
    description: li.description ?? null,
    datetime: li.datetime ?? null,
  }))

  const existing_my = my_txn
  let actor_txn_id: string
  if (existing_my) {
    await tx.line_item.deleteMany({ where: { transaction_id: existing_my } })
    await tx.transaction.update({
      where: { id: existing_my },
      data: { datetime: source.datetime, description: source.description, line_items: { create: data_lines } },
    })
    actor_txn_id = existing_my
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

  await sync_links_after_update(tx, actor_id, actor_txn_id, { propagate: true })
}

export async function create_links_for_transaction(tx: Tx, user_id: string, transaction_id: string): Promise<string[]> {
  const counterparties = await linked_counterparties(tx, transaction_id)
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

  let created = 0
  for (const tid of txnIds) {
    if (already.has(tid)) continue
    await tx.transaction_link.create({
      data: {
        user_a_id: user_id,
        user_b_id: counterparty_id,
        txn_a_id: tid,
        pending_status: 'pending',
        pending_kind: 'change',
        pending_by: counterparty_id,
      },
    })
    created++
  }
  return created
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

export async function sync_links_after_update(tx: Tx, user_id: string, transaction_id: string, opts: { propagate?: boolean } = {}): Promise<void> {
  const current = await linked_counterparties(tx, transaction_id)
  const existing = await links_owned_by(tx, user_id, transaction_id)

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
  }
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
  const users = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } })
  const nameById = new Map(users.map(u => [u.id, u.username]))
  const recips = await prisma.accounting_head.findMany({
    where: { user_id, linked_user_id: { in: otherIds }, type: 'account' },
    select: { linked_user_id: true },
  })
  const hasRecip = new Set(recips.map(r => r.linked_user_id))

  const sourceIds = links.map(l => their_txn_id(l, user_id)).filter((id): id is string => id !== null)
  const sourceTxns = await prisma.transaction.findMany({
    where: { id: { in: sourceIds } },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
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
  const users = await prisma.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, username: true } })
  const nameById = new Map(users.map(u => [u.id, u.username]))

  const myIds = links.map(l => my_txn_id(l, user_id)).filter((id): id is string => id !== null)
  const myTxns = await prisma.transaction.findMany({
    where: { id: { in: myIds } },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
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
  const otherUser = await prisma.user.findUnique({ where: { id: other }, select: { username: true } })
  const recip = await prisma.accounting_head.findFirst({
    where: { user_id, linked_user_id: other, type: 'account' },
    select: { id: true, name: true },
  })

  const sourceTxnId = their_txn_id(link, user_id)
  let mirrored: EditorContext['mirrored_lines'] = []
  let datetime: string | null = null
  let description: string | null = null
  if (sourceTxnId) {
    const src = await prisma.transaction.findUnique({
      where: { id: sourceTxnId },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    })
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
  }

  const prefill: EditorContext['prefill_balancing'] = []
  const otherLocked: EditorContext['other_locked_lines'] = []
  let previous: EditorContext['previous'] = null
  const myTxnId = my_txn_id(link, user_id)
  if (myTxnId && recip) {
    const mine = await prisma.transaction.findUnique({
      where: { id: myTxnId },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    })
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
