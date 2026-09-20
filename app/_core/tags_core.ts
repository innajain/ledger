import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@/generated/prisma/client'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { is_future_txn_due } from '@/app/_utils/future_txn'
import { summarize_tag_flow, type TagFlow } from '@/app/_utils/tag_rollup'
import { ActionResult, ok, err, ActionError } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

// A transaction tag is a label the user hangs on whole transactions ("Eating
// out", "Goa trip"). It is descriptive only: nothing here touches balances, net
// worth, XIRR, income/expense or the null-remainder normalization, so no write
// in this file invalidates a cached balance or a frozen timeseries. That is the
// whole reason tagging can be a cheap, freely-editable overlay.

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export const MAX_GROUPS_PER_TRANSACTION = 20

const nameSchema = z.string().trim().min(1, 'Give the tag a name').max(100, 'Tag name is too long')

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, 'Description is too long')
  .transform(val => (val === '' ? null : val))
  .nullish()

const createTagSchema = z.object({ name: nameSchema, description: descriptionSchema })
const updateTagSchema = z.object({ id: z.string().min(1, 'Tag id is required'), name: nameSchema.optional(), description: descriptionSchema })

export type TagSummary = TagFlow & {
  id: string
  name: string
  description: string | null
  created_at: Date
  /** Newest member's datetime, so the list can lead with the tag you actually use. */
  last_datetime: Date | null
}

export type TagTransactionRow = {
  id: string
  datetime: Date
  description: string | null
  is_future: boolean
  /** Only ever true on a future row — a real transaction is always in the past. */
  is_due: boolean
  /** Signed net over the transaction's account lines, same figure the list page shows. */
  net: number
}

export type TagDetail = {
  id: string
  name: string
  description: string | null
  created_at: Date
  summary: TagFlow
  transactions: TagTransactionRow[]
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** id + name only — the picker on the transaction form and MCP's name resolution. */
export async function list_tag_names_core(user_id: string): Promise<{ id: string; name: string }[]> {
  return prisma.transaction_tag.findMany({ where: { user_id }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}

// The rollup runs in SQL rather than pulling every tagged transaction's line
// items into JS — the same reasoning (and the same stored-column total) as the
// amount-sort branch of the transactions list page: validation guarantees
// account lines always carry a quantity and non-rupee account lines a
// txn_value, so COALESCE(txn_value, quantity) reproduces the normalized book
// total without reading a single line item. The FILTER clauses mirror
// summarize_tag_flow (app/_utils/tag_rollup.ts), which is the definition
// and carries the unit tests; keep the two in step.
async function tag_rollup_sql(user_id: string) {
  return prisma.$queryRaw<
    { tag_id: string; count: number; future_count: number; inflow: number; outflow: number; last_datetime: Date | null }[]
  >(Prisma.sql`
    WITH member_totals AS (
      SELECT m.tag_id,
             t.id,
             t.is_future,
             t.datetime,
             COALESCE((
               SELECT SUM(COALESCE(li.txn_value, li.quantity))
               FROM line_item li
               JOIN accounting_head ah ON ah.id = li.accounting_head_id AND ah.type = 'account'
               WHERE li.transaction_id = t.id
             ), 0) AS total
      FROM transaction_tag_member m
      JOIN "transaction" t ON t.id = m.transaction_id
      JOIN transaction_tag g ON g.id = m.tag_id
      WHERE g.user_id = ${user_id} AND t.user_id = ${user_id}
    )
    SELECT tag_id,
           COUNT(*) FILTER (WHERE NOT is_future)::int AS count,
           COUNT(*) FILTER (WHERE is_future)::int AS future_count,
           COALESCE(SUM(total) FILTER (WHERE NOT is_future AND total > 0), 0)::float8 AS inflow,
           COALESCE(-SUM(total) FILTER (WHERE NOT is_future AND total < 0), 0)::float8 AS outflow,
           MAX(datetime) AS last_datetime
    FROM member_totals
    GROUP BY tag_id
  `)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function list_transaction_tags_core(user_id: string): Promise<TagSummary[]> {
  const [tags, rollup] = await Promise.all([
    prisma.transaction_tag.findMany({
      where: { user_id },
      select: { id: true, name: true, description: true, created_at: true },
      orderBy: { name: 'asc' },
    }),
    tag_rollup_sql(user_id),
  ])
  const by_id = new Map(rollup.map(r => [r.tag_id, r]))
  return tags.map(g => {
    const r = by_id.get(g.id)
    const inflow = round2(r?.inflow ?? 0)
    const outflow = round2(r?.outflow ?? 0)
    return {
      ...g,
      count: r?.count ?? 0,
      future_count: r?.future_count ?? 0,
      inflow,
      outflow,
      net: round2(inflow - outflow),
      last_datetime: r?.last_datetime ?? null,
    }
  })
}

export type TagDetailOpts = {
  /** Cap the transactions returned (newest first). Undefined = all of them. */
  limit?: number
  offset?: number
}

export async function get_transaction_tag_core(user_id: string, id: string, opts: TagDetailOpts = {}): Promise<TagDetail | null> {
  const tag = await prisma.transaction_tag.findFirst({
    where: { id, user_id },
    select: { id: true, name: true, description: true, created_at: true },
  })
  if (!tag) return null

  // The summary must cover the whole tag even when the page shows one slice of
  // it, so totals come from every member and pagination applies only to the rows.
  const members = await prisma.transaction.findMany({
    where: { user_id, tag_members: { some: { tag_id: id } } },
    select: {
      id: true,
      datetime: true,
      description: true,
      is_future: true,
      line_items: {
        select: {
          quantity: true,
          txn_value: true,
          accounting_head: { select: { type: true } },
          asset: { select: { id: true, type: true, name: true } },
        },
      },
    },
    orderBy: { datetime: 'desc' },
  })

  // One `now` for every row, so two rows either side of an IST midnight can't
  // disagree about what "today" is (same rule as the transactions list).
  const now = new Date()
  const rows: TagTransactionRow[] = members.map(t => ({
    id: t.id,
    datetime: t.datetime,
    description: t.description,
    is_future: t.is_future,
    is_due: t.is_future && is_future_txn_due(t.datetime, now),
    net: normalize_line_items(t.line_items)
      .filter(li => li.accounting_head.type === 'account')
      .reduce((s, li) => s.add(li.txn_value), new Prisma.Decimal(0))
      .toNumber(),
  }))

  const offset = opts.offset ?? 0
  return {
    ...tag,
    summary: summarize_tag_flow(rows),
    transactions: opts.limit === undefined ? rows.slice(offset) : rows.slice(offset, offset + opts.limit),
  }
}

/** tag ids per transaction, for a page that renders several transactions at once. */
export async function tags_for_transactions_core(user_id: string, transaction_ids: string[]): Promise<Map<string, { id: string; name: string }[]>> {
  if (transaction_ids.length === 0) return new Map()
  const rows = await prisma.transaction_tag_member.findMany({
    where: { transaction_id: { in: transaction_ids }, tag: { user_id } },
    select: { transaction_id: true, tag: { select: { id: true, name: true } } },
    orderBy: { tag: { name: 'asc' } },
  })
  const out = new Map<string, { id: string; name: string }[]>()
  for (const r of rows) {
    const list = out.get(r.transaction_id) ?? []
    list.push(r.tag)
    out.set(r.transaction_id, list)
  }
  return out
}

export async function tags_for_transaction_core(user_id: string, transaction_id: string): Promise<{ id: string; name: string }[]> {
  return (await tags_for_transactions_core(user_id, [transaction_id])).get(transaction_id) ?? []
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Postgres's unique index on (name, user_id) is case-sensitive, so "Dinner" and
// "dinner" would both be accepted and then read as two different tags in a
// picker. Catch that here with an explicit check; the index stays the backstop
// for the exact-case race.
async function assert_name_free(tx: Tx, user_id: string, name: string, except_id?: string) {
  const clash = await tx.transaction_tag.findFirst({
    where: { user_id, name: { equals: name, mode: 'insensitive' }, ...(except_id ? { NOT: { id: except_id } } : {}) },
    select: { name: true },
  })
  if (clash) throw new ActionError('VALIDATION', `You already have a tag called “${clash.name}”`)
}

export async function create_transaction_tag_core(
  user_id: string,
  input: { name: string; description?: string | null | undefined },
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const parsed = createTagSchema.safeParse(input)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const created = await prisma.$transaction(async tx => {
      await assert_name_free(tx, user_id, parsed.data.name)
      return tx.transaction_tag.create({
        data: { user_id, name: parsed.data.name, description: parsed.data.description ?? null },
        select: { id: true, name: true },
      })
    })
    audit('transaction_tag.create', user_id)
    return ok(created, 'Tag created')
  } catch (error) {
    return reportActionError(error, { action: 'transaction_tag.create', entity: 'transaction_tag' })
  }
}

export async function update_transaction_tag_core(
  user_id: string,
  id: string,
  input: { name?: string | undefined; description?: string | null | undefined },
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const parsed = updateTagSchema.safeParse({ id, ...input })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const updated = await prisma.$transaction(async tx => {
      const existing = await tx.transaction_tag.findFirst({ where: { id: parsed.data.id, user_id }, select: { id: true } })
      if (!existing) throw new ActionError('NOT_FOUND', 'Tag not found')
      if (parsed.data.name !== undefined) await assert_name_free(tx, user_id, parsed.data.name, parsed.data.id)
      return tx.transaction_tag.update({
        where: { id: parsed.data.id },
        // `description: undefined` means "leave it alone"; an explicit null clears it.
        data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), description: parsed.data.description },
        select: { id: true, name: true },
      })
    })
    audit('transaction_tag.update', user_id)
    return ok(updated, 'Tag updated')
  } catch (error) {
    return reportActionError(error, { action: 'transaction_tag.update', entity: 'transaction_tag' })
  }
}

// Deleting a tag deletes only the label: its memberships cascade away and
// every transaction it held stays exactly as it was.
export async function delete_transaction_tag_core(user_id: string, id: string): Promise<ActionResult<{ member_count: number }>> {
  try {
    const existing = await prisma.transaction_tag.findFirst({
      where: { id, user_id },
      select: { _count: { select: { members: true } } },
    })
    if (!existing) return err('NOT_FOUND', 'Tag not found')
    await prisma.transaction_tag.delete({ where: { id } })
    audit('transaction_tag.delete', user_id, { member_count: existing._count.members })
    return ok({ member_count: existing._count.members }, 'Tag deleted — the transactions in it were not touched')
  } catch (error) {
    return reportActionError(error, { action: 'transaction_tag.delete', entity: 'transaction_tag' })
  }
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/**
 * Validate that every id names a tag this user owns, and hand back the
 * de-duplicated list. Runs inside whatever client the caller is already using,
 * so a transaction write can check ownership in the same $transaction it
 * inserts the memberships in.
 */
export async function resolve_own_tag_ids(tx: Tx, user_id: string, tag_ids: string[], owned?: Set<string>): Promise<string[]> {
  const wanted = [...new Set(tag_ids.map(g => g.trim()).filter(Boolean))]
  if (wanted.length === 0) return []
  if (wanted.length > MAX_GROUPS_PER_TRANSACTION)
    throw new ActionError('VALIDATION', `A transaction can be in at most ${MAX_GROUPS_PER_TRANSACTION} tags`)
  // `owned` is the caller's already-loaded set of this user's tag ids — the bulk
  // create path passes it so a 50-transaction import doesn't run 50 ownership queries.
  const found_count = owned
    ? wanted.filter(g => owned.has(g)).length
    : (await tx.transaction_tag.findMany({ where: { id: { in: wanted }, user_id }, select: { id: true } })).length
  if (found_count !== wanted.length) throw new ActionError('VALIDATION', 'One or more tags not found')
  return wanted
}

/** The user's tag ids, for callers that validate many transactions in one pass. */
export async function load_own_tag_ids(tx: Tx, user_id: string): Promise<Set<string>> {
  const rows = await tx.transaction_tag.findMany({ where: { user_id }, select: { id: true } })
  return new Set(rows.map(r => r.id))
}

/**
 * Put a freshly created transaction into `tag_ids`. Separate from
 * apply_transaction_tags because a brand-new transaction provably has no
 * memberships yet, so it can skip the read-and-diff.
 */
export async function attach_transaction_tags(
  tx: Tx,
  user_id: string,
  transaction_id: string,
  tag_ids: string[],
  owned?: Set<string>,
): Promise<void> {
  const wanted = await resolve_own_tag_ids(tx, user_id, tag_ids, owned)
  if (wanted.length === 0) return
  await tx.transaction_tag_member.createMany({ data: wanted.map(tag_id => ({ transaction_id, tag_id })), skipDuplicates: true })
}

/**
 * Make `tag_ids` the transaction's complete tag membership. Called from the
 * transaction update path inside its own $transaction, and by
 * set_transaction_tags_core on its own.
 *
 * Existing memberships that survive are left alone rather than deleted and
 * re-inserted, so created_at keeps telling the truth about when a transaction
 * joined a tag.
 */
export async function apply_transaction_tags(tx: Tx, user_id: string, transaction_id: string, tag_ids: string[]): Promise<void> {
  const wanted = await resolve_own_tag_ids(tx, user_id, tag_ids)
  const current = await tx.transaction_tag_member.findMany({ where: { transaction_id }, select: { tag_id: true } })
  const current_ids = new Set(current.map(c => c.tag_id))
  const wanted_ids = new Set(wanted)

  const to_remove = [...current_ids].filter(g => !wanted_ids.has(g))
  const to_add = wanted.filter(g => !current_ids.has(g))

  if (to_remove.length > 0) await tx.transaction_tag_member.deleteMany({ where: { transaction_id, tag_id: { in: to_remove } } })
  if (to_add.length > 0)
    await tx.transaction_tag_member.createMany({
      data: to_add.map(tag_id => ({ transaction_id, tag_id })),
      skipDuplicates: true,
    })
}

export async function set_transaction_tags_core(user_id: string, transaction_id: string, tag_ids: string[]): Promise<ActionResult> {
  try {
    await prisma.$transaction(async tx => {
      const txn = await tx.transaction.findFirst({ where: { id: transaction_id, user_id }, select: { id: true } })
      if (!txn) throw new ActionError('NOT_FOUND', 'Transaction not found')
      await apply_transaction_tags(tx, user_id, transaction_id, tag_ids)
    })
    audit('transaction_tag.set_members', user_id, { tag_count: tag_ids.length })
    return ok(undefined, 'Tags updated')
  } catch (error) {
    return reportActionError(error, { action: 'transaction_tag.set_members', entity: 'transaction_tag' })
  }
}

export async function add_transactions_to_tag_core(
  user_id: string,
  tag_id: string,
  transaction_ids: string[],
): Promise<ActionResult<{ added: number }>> {
  try {
    const wanted = [...new Set(transaction_ids.map(t => t.trim()).filter(Boolean))]
    if (wanted.length === 0) return err('VALIDATION', 'Give at least one transaction')
    const added = await prisma.$transaction(async tx => {
      const tag = await tx.transaction_tag.findFirst({ where: { id: tag_id, user_id }, select: { id: true } })
      if (!tag) throw new ActionError('NOT_FOUND', 'Tag not found')
      const owned = await tx.transaction.findMany({ where: { id: { in: wanted }, user_id }, select: { id: true } })
      if (owned.length !== wanted.length) throw new ActionError('VALIDATION', 'One or more transactions not found')
      const res = await tx.transaction_tag_member.createMany({
        data: owned.map(t => ({ transaction_id: t.id, tag_id })),
        skipDuplicates: true,
      })
      return res.count
    })
    audit('transaction_tag.add_members', user_id, { requested_count: wanted.length, added_count: added })
    return ok({ added }, added === wanted.length ? `Added ${added} to the tag` : `Added ${added} — the rest were already in the tag`)
  } catch (error) {
    return reportActionError(error, { action: 'transaction_tag.add_members', entity: 'transaction_tag' })
  }
}

export async function remove_transactions_from_tag_core(
  user_id: string,
  tag_id: string,
  transaction_ids: string[],
): Promise<ActionResult<{ removed: number }>> {
  try {
    const wanted = [...new Set(transaction_ids.map(t => t.trim()).filter(Boolean))]
    if (wanted.length === 0) return err('VALIDATION', 'Give at least one transaction')
    const tag = await prisma.transaction_tag.findFirst({ where: { id: tag_id, user_id }, select: { id: true } })
    if (!tag) return err('NOT_FOUND', 'Tag not found')
    const { count } = await prisma.transaction_tag_member.deleteMany({ where: { tag_id, transaction_id: { in: wanted } } })
    audit('transaction_tag.remove_members', user_id, { requested_count: wanted.length, removed_count: count })
    return ok({ removed: count }, `Removed ${count} from the tag`)
  } catch (error) {
    return reportActionError(error, { action: 'transaction_tag.remove_members', entity: 'transaction_tag' })
  }
}
