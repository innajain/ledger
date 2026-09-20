import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { asset_type } from '@/generated/prisma/enums'
import type { accounting_head, asset, Prisma } from '@/generated/prisma/client'
import { ist_date_key } from '@/app/_utils/value_timeseries_core'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { assert_no_locked_lines } from '@/app/_utils/lock_date'
import { toDecimal } from '@/app/_utils/decimal'
import { invalidate_balances } from '@/app/_core/balances_core'
import type { TouchedEntities } from '@/app/_utils/value_timeseries'
import { create_links_for_transaction, sync_links_after_update, prepare_links_for_delete } from '@/app/_utils/links'
import { attach_transaction_tags, apply_transaction_tags, load_own_tag_ids } from '@/app/_core/tags_core'
import { notify_request_pending } from '@/app/_utils/notify_events'
import { audit } from '@/lib/logger'
import { ActionResult, ok, err, ActionError } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'

export type CreateLineItemInput = {
  accounting_head_id: string
  asset_id: string
  quantity?: number
  txn_value?: number | null | undefined
  description?: string | null | undefined
  datetime?: Date | null | undefined
}

export type CreateTransactionOpts = {
  idempotency_key?: string | null | undefined
  is_future?: boolean
  /**
   * Transaction tags (app/_core/tags_core.ts) this transaction joins. Purely a
   * label — membership affects no balance, so it needs no invalidation and is never
   * mirrored onto a linked user's copy.
   */
  tag_ids?: string[] | null | undefined
}

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// The heads/assets a write's line items actually touched, so invalidation can skip
// unrelated frozen timeseries. Pass every line-item set involved (e.g. old + new on
// update) with its transaction datetime — underestimating leaves a stale chart for the
// rest of the IST day. The earliest effective day lets today-only writes keep their
// frozen series (which never cover today).
type TouchedSet = { txn_datetime: Date; line_items: { accounting_head_id: string; asset_id: string; datetime?: Date | null }[] }

function touched_entities(...sets: TouchedSet[]): TouchedEntities {
  const head_ids = new Set<string>()
  const asset_ids = new Set<string>()
  let earliest: Date | undefined
  for (const s of sets) {
    for (const li of s.line_items) {
      head_ids.add(li.accounting_head_id)
      asset_ids.add(li.asset_id)
      const effective = li.datetime ?? s.txn_datetime
      if (!earliest || effective < earliest) earliest = effective
    }
  }
  return { head_ids, asset_ids, earliest_day: earliest ? ist_date_key(earliest) : undefined }
}

const lineItemSchema = z.object({
  accounting_head_id: z.string(),
  asset_id: z.string(),
  quantity: z.number().optional(),
  txn_value: z.number().nullish(),
  description: z
    .string()
    .trim()
    .max(2000, 'Description is too long')
    .transform(val => (val === '' ? null : val))
    .nullish(),
  datetime: z.date().nullish(),
})

const descriptionSchema = z
  .string()
  .trim()
  .max(2000, 'Description is too long')
  .transform(val => (val === '' ? null : val))
  .nullish()

const idempotencyKeySchema = z
  .string()
  .trim()
  .max(200, 'idempotency_key is too long')
  .transform(val => (val === '' ? null : val))
  .nullish()

const tagIdsSchema = z.array(z.string().trim().min(1)).nullish()

const createTransactionSchema = z.object({
  line_items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  description: descriptionSchema,
  idempotency_key: idempotencyKeySchema,
  is_future: z.boolean().optional(),
  tag_ids: tagIdsSchema,
})

const updateTransactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
  line_items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  description: descriptionSchema,
  is_future: z.boolean().optional(),
  // Undefined leaves the transaction's tags alone; an array (including an empty
  // one) replaces them wholesale, matching how line_items behave.
  tag_ids: z.array(z.string().trim().min(1)).optional(),
})

const deleteTransactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
})

// Batched lookups for the bulk path: heads/assets/idempotency hits are fetched once for
// the whole batch instead of per item. The idempotency map is mutable — newly created
// (key, id) pairs are registered so a duplicate key later in the same batch replays.
type BulkCaches = {
  heads: Map<string, accounting_head>
  assets: Map<string, asset>
  idempotency: Map<string, string>
  tag_ids: Set<string>
}

// Runs inside an existing $transaction. Replays (same user + idempotency_key)
// return the existing transaction id instead of inserting a duplicate.
async function create_transaction_in_tx(
  tx: Tx,
  user_id: string,
  datetime: Date,
  line_items: CreateLineItemInput[],
  description: string | null | undefined,
  opts?: CreateTransactionOpts,
  caches?: BulkCaches,
): Promise<{ id: string; counterparties: string[]; replayed: boolean }> {
  if (opts?.idempotency_key) {
    if (caches) {
      const hit = caches.idempotency.get(opts.idempotency_key)
      if (hit) return { id: hit, counterparties: [], replayed: true }
    } else {
      const existing = await tx.transaction.findUnique({
        where: { user_id_idempotency_key: { user_id, idempotency_key: opts.idempotency_key } },
        select: { id: true },
      })
      if (existing) return { id: existing.id, counterparties: [], replayed: true }
    }
  }

  const accounting_head_ids = Array.from(new Set(line_items.map(li => li.accounting_head_id)))
  const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

  const accounts = caches
    ? accounting_head_ids.flatMap(id => caches.heads.get(id) ?? [])
    : await tx.accounting_head.findMany({
        where: { id: { in: accounting_head_ids }, user_id },
      })
  if (accounts.length !== accounting_head_ids.length) throw new ActionError('VALIDATION', 'One or more accounts not found')

  const assets = caches
    ? asset_ids.flatMap(id => caches.assets.get(id) ?? [])
    : await tx.asset.findMany({
        where: { id: { in: asset_ids } },
      })
  if (assets.length !== asset_ids.length) throw new ActionError('VALIDATION', 'One or more assets not found')

  const is_future = opts?.is_future ?? false

  if (!is_future)
    assert_no_locked_lines(
      'create',
      datetime,
      line_items.map(li => ({ datetime: li.datetime, accounting_head: accounts.find(a => a.id === li.accounting_head_id)! })),
    )

  const { is_valid, message } = validate_line_items(
    line_items.map(li => ({
      quantity: toDecimal(li.quantity),
      txn_value: toDecimal(li.txn_value),
      asset: assets.find(a => a.id === li.asset_id)!,
      accounting_head: accounts.find(a => a.id === li.accounting_head_id)!,
    })),
  )

  if (!is_valid) throw new ActionError('VALIDATION', message)

  const created = await tx.transaction.create({
    data: {
      datetime,
      description,
      user_id,
      is_future,
      idempotency_key: opts?.idempotency_key ?? null,
      line_items: {
        create: line_items.map(li => ({
          quantity: toDecimal(li.quantity),
          txn_value: toDecimal(li.txn_value),
          accounting_head_id: li.accounting_head_id,
          asset_id: li.asset_id,
          description: li.description,
          datetime: li.datetime,
        })),
      },
    },
  })

  if (opts?.idempotency_key && caches) caches.idempotency.set(opts.idempotency_key, created.id)

  if (opts?.tag_ids && opts.tag_ids.length > 0) await attach_transaction_tags(tx, user_id, created.id, opts.tag_ids, caches?.tag_ids)

  // The fetched head rows already carry linked_user_id — no need to re-read the
  // just-written line items to find counterparties.
  const counterparties = Array.from(new Set(accounts.map(a => a.linked_user_id).filter((x): x is string => !!x)))
  // While a transaction stays future it's a private draft: no mirror/approval is
  // created even if it touches a linked account. Links are deferred until it becomes
  // real — see §4.3/§4.4 (update_transaction_core).
  if (is_future) return { id: created.id, counterparties: [], replayed: false }
  await create_links_for_transaction(tx, user_id, created.id, counterparties)
  return { id: created.id, counterparties, replayed: false }
}

export async function create_transaction_core(
  user_id: string,
  datetime: Date,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
  opts?: CreateTransactionOpts,
): Promise<ActionResult<{ id: string; replayed?: boolean }>> {
  try {
    const parsed = createTransactionSchema.safeParse({ line_items, description, ...opts })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const { id, counterparties, replayed } = await prisma.$transaction(async prisma =>
      create_transaction_in_tx(prisma, user_id, datetime, parsed.data.line_items, parsed.data.description, {
        idempotency_key: parsed.data.idempotency_key,
        is_future: parsed.data.is_future,
        tag_ids: parsed.data.tag_ids,
      }),
    )

    if (replayed) {
      audit('transaction.replay', user_id)
      return ok({ id, replayed: true }, 'Already recorded — this transaction already exists, so nothing new was created')
    }

    // A future transaction has no balance effect yet — nothing to invalidate or notify.
    if (!parsed.data.is_future) await invalidate_balances(user_id, touched_entities({ txn_datetime: datetime, line_items: parsed.data.line_items }))

    for (const cp of counterparties) void notify_request_pending(cp, user_id, { description: parsed.data.description })
    audit('transaction.create', user_id, {
      line_item_count: parsed.data.line_items.length,
      counterparty_count: counterparties.length,
      future: parsed.data.is_future ?? false,
      tag_count: parsed.data.tag_ids?.length ?? 0,
    })
    return ok({ id }, 'Transaction created')
  } catch (error) {
    // Concurrent create with the same idempotency_key: the unique constraint is
    // the backstop — resolve the race to a replay instead of an error.
    const key = opts?.idempotency_key?.trim()
    if (key && error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'P2002') {
      const existing = await prisma.transaction.findUnique({
        where: { user_id_idempotency_key: { user_id, idempotency_key: key } },
        select: { id: true },
      })
      if (existing) {
        audit('transaction.replay', user_id)
        return ok({ id: existing.id, replayed: true }, 'Already recorded — this transaction already exists, so nothing new was created')
      }
    }
    return reportActionError(error, { action: 'transaction.create', entity: 'transaction' })
  }
}

export type BulkTransactionInput = {
  datetime: Date
  line_items: CreateLineItemInput[]
  description?: string | null | undefined
  idempotency_key?: string | null | undefined
  is_future?: boolean
  tag_ids?: string[] | null | undefined
}

// All-or-nothing bulk create: every transaction commits or none do. Items whose
// idempotency_key already exists are replayed (skipped), not treated as errors.
export async function create_transactions_core(
  user_id: string,
  items: BulkTransactionInput[],
): Promise<ActionResult<{ ids: string[]; replayed_ids: string[] }>> {
  try {
    if (items.length === 0) return err('VALIDATION', 'At least one transaction is required')

    const run_batch = () =>
      prisma.$transaction(
        async tx => {
          const parsed_items = items.map((item, i) => {
            const parsed = createTransactionSchema.safeParse({
              line_items: item.line_items,
              description: item.description,
              idempotency_key: item.idempotency_key,
              is_future: item.is_future,
              tag_ids: item.tag_ids,
            })
            if (!parsed.success) throw new ActionError('VALIDATION', `Transaction ${i + 1}: ${parsed.error.issues[0].message}`)
            return parsed.data
          })

          // Heads/assets are never written inside this tx and all idempotency keys are
          // known up front — three batched lookups replace ~3 round trips per item.
          const all_head_ids = Array.from(new Set(parsed_items.flatMap(p => p.line_items.map(li => li.accounting_head_id))))
          const all_asset_ids = Array.from(new Set(parsed_items.flatMap(p => p.line_items.map(li => li.asset_id))))
          const all_keys = parsed_items.map(p => p.idempotency_key).filter((k): k is string => !!k)
          const head_rows = await tx.accounting_head.findMany({ where: { id: { in: all_head_ids }, user_id } })
          const asset_rows = await tx.asset.findMany({ where: { id: { in: all_asset_ids } } })
          // Loaded once for the batch, and only when some item actually names a tag.
          const owned_tag_ids = parsed_items.some(p => p.tag_ids?.length) ? await load_own_tag_ids(tx, user_id) : new Set<string>()
          const existing_keys = all_keys.length
            ? await tx.transaction.findMany({
                where: { user_id, idempotency_key: { in: all_keys } },
                select: { id: true, idempotency_key: true },
              })
            : []
          const caches: BulkCaches = {
            heads: new Map(head_rows.map(h => [h.id, h])),
            assets: new Map(asset_rows.map(a => [a.id, a])),
            idempotency: new Map(existing_keys.map(t => [t.idempotency_key!, t.id])),
            tag_ids: owned_tag_ids,
          }

          const results: { id: string; replayed: boolean }[] = []
          const cps = new Set<string>()
          for (let i = 0; i < parsed_items.length; i++) {
            const parsed = parsed_items[i]
            try {
              const r = await create_transaction_in_tx(
                tx,
                user_id,
                items[i].datetime,
                parsed.line_items,
                parsed.description,
                { idempotency_key: parsed.idempotency_key, is_future: parsed.is_future, tag_ids: parsed.tag_ids },
                caches,
              )
              for (const cp of r.counterparties) cps.add(cp)
              results.push({ id: r.id, replayed: r.replayed })
            } catch (error) {
              if (error instanceof ActionError) throw new ActionError(error.code, `Transaction ${i + 1}: ${error.message}`)
              throw error
            }
          }
          return { results, counterparties: [...cps] }
        },
        { timeout: 60_000 },
      )

    let outcome: Awaited<ReturnType<typeof run_batch>>
    try {
      outcome = await run_batch()
    } catch (error) {
      // A concurrent request can commit one of this batch's idempotency keys after the
      // upfront key snapshot, so the insert P2002s. One retry re-snapshots and replays
      // that item — closing the race window instead of failing the whole batch.
      const p2002 = !!error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'P2002'
      if (p2002 && items.some(i => i.idempotency_key)) outcome = await run_batch()
      else throw error
    }
    const { results, counterparties } = outcome

    // Only real creations affect balances — future ones stay inert until converted.
    const created_real = results.map((r, i) => ({ r, item: items[i] })).filter(x => !x.r.replayed && !(x.item.is_future ?? false))
    if (created_real.length > 0) {
      await invalidate_balances(
        user_id,
        touched_entities(...created_real.map(x => ({ txn_datetime: x.item.datetime, line_items: x.item.line_items }))),
      )
      for (const cp of counterparties) void notify_request_pending(cp, user_id, {})
    }
    const created_count = results.filter(r => !r.replayed).length
    audit('transaction.create_bulk', user_id, {
      requested_count: results.length,
      created_count,
      replayed_count: results.length - created_count,
      counterparty_count: counterparties.length,
    })
    return ok(
      { ids: results.map(r => r.id), replayed_ids: results.filter(r => r.replayed).map(r => r.id) },
      `Created ${created_count} transaction${created_count === 1 ? '' : 's'}${results.length > created_count ? ` (${results.length - created_count} already recorded)` : ''}`,
    )
  } catch (error) {
    return reportActionError(error, { action: 'transaction.create_bulk', entity: 'transaction' })
  }
}

export async function update_transaction_core(
  user_id: string,
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined,
  is_future?: boolean | undefined,
  // Undefined keeps the transaction's tags; an array replaces them (empty clears).
  tag_ids?: string[] | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateTransactionSchema.safeParse({ id, line_items, description, is_future, tag_ids })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    line_items = parsed.data.line_items
    description = parsed.data.description
    is_future = parsed.data.is_future
    tag_ids = parsed.data.tag_ids

    const { old_lines, old_datetime, reopened, final_description, existing_is_future, will_be_future } = await prisma.$transaction(async prisma => {
      const existing = await prisma.transaction.findUnique({
        where: { id, user_id },
        include: {
          line_items: {
            select: { datetime: true, accounting_head_id: true, asset_id: true, accounting_head: { select: { name: true, lock_date: true } } },
          },
        },
      })
      if (!existing) throw new ActionError('NOT_FOUND', 'Transaction not found')

      const will_be_future = is_future !== undefined ? is_future : existing.is_future

      // The one blocked transition: demoting an already-real transaction that still
      // has a live (non-rejected) counterparty copy. A rejected link leaves no active
      // copy to retract, so it doesn't block the demotion; a future transaction can
      // never have any link at all, so this only ever fires on real→future.
      if (will_be_future && !existing.is_future) {
        const link_exists = await prisma.transaction_link.findFirst({
          where: { OR: [{ txn_a_id: id }, { txn_b_id: id }], pending_status: { not: 'rejected' } },
          select: { id: true },
        })
        if (link_exists) throw new ActionError('VALIDATION', "Can't mark a transaction that's already shared with a linked user as future")
      }

      // The transaction's CURRENT stored state must be checked whenever it's currently
      // real — demoting a real, locked transaction to future would otherwise erase its
      // effect from a "frozen" reconciled period with no lock check at all. A future
      // transaction's current state was never balance-affecting, so it's exempt.
      if (!existing.is_future) {
        // both the transaction's current lines and its would-be lines must be
        // outside every lock — moving a txn out of a locked period is also a change
        assert_no_locked_lines('update', existing.datetime, existing.line_items)
      }

      const accounting_head_ids = Array.from(new Set(line_items.map(li => li.accounting_head_id)))
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

      const accounts = await prisma.accounting_head.findMany({
        where: { id: { in: accounting_head_ids }, user_id },
      })
      if (accounts.length !== accounting_head_ids.length) throw new ActionError('VALIDATION', 'One or more accounts not found')

      const assets = await prisma.asset.findMany({
        where: { id: { in: asset_ids } },
      })
      if (assets.length !== asset_ids.length) throw new ActionError('VALIDATION', 'One or more assets not found')

      if (!will_be_future)
        assert_no_locked_lines(
          'update',
          datetime ?? existing.datetime,
          line_items.map(li => ({ datetime: li.datetime, accounting_head: accounts.find(a => a.id === li.accounting_head_id)! })),
        )

      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: toDecimal(li.quantity),
          txn_value: toDecimal(li.txn_value),
          asset: assets.find(a => a.id === li.asset_id)!,
          accounting_head: accounts.find(a => a.id === li.accounting_head_id)!,
        })),
      )

      if (!is_valid) throw new ActionError('VALIDATION', message)

      await prisma.line_item.deleteMany({ where: { transaction_id: id } })

      await prisma.transaction.update({
        where: { id, user_id },
        data: {
          datetime,
          description,
          is_future,
          line_items: {
            create: line_items.map(li => ({
              quantity: toDecimal(li.quantity),
              txn_value: toDecimal(li.txn_value),
              accounting_head_id: li.accounting_head_id,
              asset_id: li.asset_id,
              description: li.description,
              datetime: li.datetime,
            })),
          },
        },
      })

      // Tags are a label on this user's own copy: they are never mirrored to a
      // counterparty and never re-open an approval, so this sits outside the link
      // handling below and is skipped entirely when the caller didn't mention them.
      if (tag_ids !== undefined) await apply_transaction_tags(prisma, user_id, id, tag_ids)

      // The fetched head rows carry linked_user_id, so the sync can skip re-reading the
      // just-written line items; its return names the counterparties to notify, which
      // saves the post-commit link scan this function used to do.
      const counterparties = Array.from(new Set(accounts.map(a => a.linked_user_id).filter((x): x is string => !!x)))
      // Link handling depends on the transition:
      // - stays future / real→future: no links exist (the real→future guard above
      //   rejected transactions with any), so there's nothing to create, sync or tear down.
      // - future→real: its links were deferred while future — this is its first time
      //   becoming linkable, so create them fresh (notify_request_pending on the caller's
      //   plain variant), matching a fresh create on a shared account.
      // - real→real: unchanged — sync what the counterparty already has.
      let reopened: string[] = []
      if (!will_be_future && existing.is_future) {
        reopened = await create_links_for_transaction(prisma, user_id, id, counterparties)
      } else if (!will_be_future) {
        reopened = await sync_links_after_update(prisma, user_id, id, { counterparties })
      }
      return {
        old_lines: existing.line_items.map(li => ({ accounting_head_id: li.accounting_head_id, asset_id: li.asset_id, datetime: li.datetime })),
        old_datetime: existing.datetime,
        reopened,
        final_description: description !== undefined ? description : existing.description,
        existing_is_future: existing.is_future,
        will_be_future,
      }
    })

    // Both the replaced and the new lines' entities changed history — but only when at
    // least one side of the update is real. A future→future edit touched no balances.
    if (!(existing_is_future && will_be_future)) {
      await invalidate_balances(
        user_id,
        touched_entities({ txn_datetime: old_datetime, line_items: old_lines }, { txn_datetime: datetime ?? old_datetime, line_items: line_items }),
      )
    }

    // Future→real conversions create a fresh pending request (plain variant); all other
    // reopened links are changes to an existing pending request ("changed" variant).
    for (const cp of reopened) void notify_request_pending(cp, user_id, { changed: !existing_is_future, description: final_description ?? null })
    audit('transaction.update', user_id, {
      line_item_count: line_items.length,
      was_future: existing_is_future,
      future: will_be_future,
      counterparty_count: reopened.length,
      tags_changed: tag_ids !== undefined,
    })
    return ok(undefined, 'Transaction updated')
  } catch (error) {
    return reportActionError(error, { action: 'transaction.update', entity: 'transaction' })
  }
}

// The full deleted row, returned so callers can build re-creatable snapshots without
// their own pre-delete read (the lock assertion already needs most of these fields).
export type DeletedTransaction = {
  datetime: Date
  description: string | null
  had_attachments: boolean
  /** Tags it belonged to, so an undo can put it back into them. */
  tag_ids: string[]
  line_items: {
    accounting_head_id: string
    asset_id: string
    account_name: string
    asset_name: string
    quantity: Prisma.Decimal | null
    txn_value: Prisma.Decimal | null
    description: string | null
    datetime: Date | null
  }[]
}

export async function delete_transaction_core(user_id: string, id: string): Promise<ActionResult<DeletedTransaction>> {
  try {
    const parsed = deleteTransactionSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    const deleted = await prisma.$transaction(async tx => {
      const existing = await tx.transaction.findUnique({
        where: { id, user_id },
        select: {
          datetime: true,
          description: true,
          is_future: true,
          attachments: { select: { id: true }, take: 1 },
          tag_members: { select: { tag_id: true } },
          line_items: {
            select: {
              datetime: true,
              accounting_head_id: true,
              asset_id: true,
              quantity: true,
              txn_value: true,
              description: true,
              accounting_head: { select: { name: true, lock_date: true } },
              asset: { select: { name: true } },
            },
          },
        },
      })
      if (!existing) throw new ActionError('NOT_FOUND', 'Transaction not found')
      // A future transaction never touched any balance, so the reconciliation lock
      // — which only protects already-counted history — never applied to it.
      if (!existing.is_future) assert_no_locked_lines('delete', existing.datetime, existing.line_items)

      await prepare_links_for_delete(tx, user_id, id)
      await tx.transaction.delete({ where: { id, user_id } })
      return existing
    })
    // A future transaction never touched balances, so deleting it invalidates nothing.
    if (!deleted.is_future)
      await invalidate_balances(
        user_id,
        touched_entities({
          txn_datetime: deleted.datetime,
          line_items: deleted.line_items.map(li => ({ accounting_head_id: li.accounting_head_id, asset_id: li.asset_id, datetime: li.datetime })),
        }),
      )
    audit('transaction.delete', user_id, {
      line_item_count: deleted.line_items.length,
      future: deleted.is_future,
      had_attachments: deleted.attachments.length > 0,
      tag_count: deleted.tag_members.length,
    })
    return ok({
      datetime: deleted.datetime,
      description: deleted.description,
      had_attachments: deleted.attachments.length > 0,
      tag_ids: deleted.tag_members.map(m => m.tag_id),
      line_items: deleted.line_items.map(li => ({
        accounting_head_id: li.accounting_head_id,
        asset_id: li.asset_id,
        account_name: li.accounting_head.name,
        asset_name: li.asset.name,
        quantity: li.quantity,
        txn_value: li.txn_value,
        description: li.description,
        datetime: li.datetime,
      })),
    })
  } catch (error) {
    return reportActionError(error, { action: 'transaction.delete', entity: 'transaction' })
  }
}

const upiPaymentSchema = z.object({
  payee_account_id: z.string().min(1, 'Payee account is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description is too long')
    .transform(val => (val === '' ? null : val))
    .nullish(),
})

export async function create_upi_payment_core(
  user_id: string,
  input: { payee_account_id: string; amount: number; description?: string | null | undefined },
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = upiPaymentSchema.safeParse(input)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const user_row = await prisma.user.findUnique({ where: { id: user_id }, select: { default_account_id: true, default_asset_id: true } })
    if (!user_row?.default_account_id) return err('NOT_FOUND', 'No default account set — pick one in Settings → Preferences')
    if (parsed.data.payee_account_id === user_row.default_account_id) return err('VALIDATION', "Payee can't be the same as your default account")

    // Full rows up front — validation, the lock assertion and link creation all read
    // them, so the interactive $transaction below holds its connection for writes only.
    const [accounts, rupees_assets] = await Promise.all([
      prisma.accounting_head.findMany({
        where: { id: { in: [user_row.default_account_id, parsed.data.payee_account_id] }, user_id },
      }),
      prisma.asset.findMany({
        where: { type: asset_type.rupees, is_active: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
    ])

    const payee = accounts.find(a => a.id === parsed.data.payee_account_id && a.type === 'account')
    if (!payee) return err('NOT_FOUND', 'Payee account not found')
    if (rupees_assets.length === 0) return err('NOT_FOUND', 'You need a rupees asset to record a payment')

    const rupees_asset = rupees_assets.find(a => a.id === user_row.default_asset_id) ?? rupees_assets[0]
    const rupees_asset_id = rupees_asset.id
    const description = parsed.data.description ?? null
    const datetime = new Date()

    const { id, counterparties } = await prisma.$transaction(async prisma => {
      const line_items = [
        {
          accounting_head_id: user_row.default_account_id!,
          asset_id: rupees_asset_id,
          quantity: toDecimal(-parsed.data.amount),
          txn_value: null,
          description,
          datetime: null,
        },
        {
          accounting_head_id: parsed.data.payee_account_id,
          asset_id: rupees_asset_id,
          quantity: toDecimal(parsed.data.amount),
          txn_value: null,
          description,
          datetime: null,
        },
      ]
      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: li.quantity,
          txn_value: li.txn_value,
          asset: rupees_asset,
          accounting_head: accounts.find(a => a.id === li.accounting_head_id)!,
        })),
      )
      if (!is_valid) throw new ActionError('VALIDATION', message)

      assert_no_locked_lines(
        'create',
        datetime,
        line_items.map(li => ({ datetime: li.datetime, accounting_head: accounts.find(a => a.id === li.accounting_head_id)! })),
      )

      const created = await prisma.transaction.create({ data: { datetime, description, user_id, line_items: { create: line_items } } })
      const counterparties = Array.from(new Set(accounts.map(a => a.linked_user_id).filter((x): x is string => !!x)))
      await create_links_for_transaction(prisma, user_id, created.id, counterparties)
      return { id: created.id, counterparties }
    })

    await invalidate_balances(
      user_id,
      touched_entities({
        txn_datetime: datetime,
        line_items: [
          { accounting_head_id: user_row.default_account_id, asset_id: rupees_asset_id },
          { accounting_head_id: parsed.data.payee_account_id, asset_id: rupees_asset_id },
        ],
      }),
    )

    for (const cp of counterparties) void notify_request_pending(cp, user_id, { description })
    audit('transaction.create_upi_payment', user_id, { counterparty_count: counterparties.length })
    return ok({ id }, 'Payment recorded')
  } catch (error) {
    return reportActionError(error, { action: 'transaction.create_upi_payment', entity: 'transaction' })
  }
}

export type PossibleDuplicate = { id: string; datetime: Date; description: string | null; amount: number }

// Near-duplicate guard for creates: an existing transaction within ±36h that
// touches one of the same account heads with the same net account flow.
// head_types: optional user-scoped id→type map from a catalog the caller already
// loaded, saving the head lookup.
export async function find_possible_duplicate(
  user_id: string,
  datetime: Date,
  line_items: CreateLineItemInput[],
  head_types?: Map<string, string>,
): Promise<PossibleDuplicate | null> {
  const wanted = [...new Set(line_items.map(li => li.accounting_head_id))]
  const heads = head_types
    ? wanted.flatMap(id => (head_types.has(id) ? [{ id, type: head_types.get(id)! }] : []))
    : await prisma.accounting_head.findMany({
        where: { id: { in: wanted }, user_id },
        select: { id: true, type: true },
      })
  const account_ids = heads.filter(h => h.type === 'account').map(h => h.id)
  if (account_ids.length === 0) return null
  const account_id_set = new Set(account_ids)
  const flow =
    Math.round(
      line_items.filter(li => account_id_set.has(li.accounting_head_id)).reduce((s, li) => s + (li.txn_value ?? li.quantity ?? 0), 0) * 100,
    ) / 100
  if (flow === 0) return null

  const window_ms = 36 * 60 * 60 * 1000
  const candidates = await prisma.transaction.findMany({
    where: {
      user_id,
      datetime: { gte: new Date(datetime.getTime() - window_ms), lte: new Date(datetime.getTime() + window_ms) },
      line_items: { some: { accounting_head_id: { in: account_ids } } },
    },
    include: { line_items: { select: { quantity: true, txn_value: true, accounting_head: { select: { type: true } } } } },
    orderBy: { datetime: 'desc' },
    take: 50,
  })
  for (const t of candidates) {
    const candidate_flow = t.line_items
      .filter(li => li.accounting_head.type === 'account')
      .reduce((s, li) => s + (li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0), 0)
    if (Math.abs(Math.round(candidate_flow * 100) / 100 - flow) <= 0.01) {
      return { id: t.id, datetime: t.datetime, description: t.description, amount: flow }
    }
  }
  return null
}

// Converting a future transaction to real is just an update that flips the flag to
// false while replaying its current line items unchanged. That reuses every guard in
// update_transaction_core for free — the lock-date check re-applies (it was skipped
// while future), links get created for the first time, and balances invalidate.
export async function convert_future_transaction_core(user_id: string, id: string): Promise<ActionResult<{ accounting_head_ids: string[] }>> {
  const existing = await prisma.transaction.findUnique({
    where: { id, user_id },
    include: { line_items: true },
  })
  if (!existing) return err('NOT_FOUND', 'Transaction not found')
  if (!existing.is_future) return err('VALIDATION', 'Transaction is already real')
  const accounting_head_ids = Array.from(new Set(existing.line_items.map(li => li.accounting_head_id)))
  const res = await update_transaction_core(
    user_id,
    id,
    existing.line_items.map(li => ({
      accounting_head_id: li.accounting_head_id,
      asset_id: li.asset_id,
      quantity: li.quantity?.toNumber(),
      txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
      description: li.description,
      datetime: li.datetime,
    })),
    existing.datetime,
    existing.description,
    false,
  )
  return res.success ? ok({ accounting_head_ids }, res.message) : res
}
