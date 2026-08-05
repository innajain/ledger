import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { asset_type } from '@/generated/prisma/enums'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { toDecimal } from '@/app/_utils/decimal'
import { invalidate_balances } from '@/app/_core/balances_core'
import { create_links_for_transaction, sync_links_after_update, prepare_links_for_delete } from '@/app/_utils/links'
import { notify_request_pending } from '@/app/_utils/notify_events'
import { logger } from '@/lib/logger'
import { ActionResult, ok, err, fromError, ActionError } from '@/app/_actions/_result'

export type CreateLineItemInput = {
  accounting_head_id: string
  asset_id: string
  quantity?: number
  txn_value?: number | null | undefined
  description?: string | null | undefined
  datetime?: Date | null | undefined
}

export type CreateTransactionOpts = {
  external_ref?: string | null | undefined
  idempotency_key?: string | null | undefined
}

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

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

const externalRefSchema = z
  .string()
  .trim()
  .max(120, 'external_ref is too long')
  .transform(val => (val === '' ? null : val))
  .nullish()

const idempotencyKeySchema = z
  .string()
  .trim()
  .max(200, 'idempotency_key is too long')
  .transform(val => (val === '' ? null : val))
  .nullish()

const createTransactionSchema = z.object({
  line_items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  description: descriptionSchema,
  external_ref: externalRefSchema,
  idempotency_key: idempotencyKeySchema,
})

const updateTransactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
  line_items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  description: descriptionSchema,
})

const deleteTransactionSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

// Runs inside an existing $transaction. Replays (same user + idempotency_key)
// return the existing transaction id instead of inserting a duplicate.
async function create_transaction_in_tx(
  tx: Tx,
  user_id: string,
  datetime: Date,
  line_items: CreateLineItemInput[],
  description: string | null | undefined,
  opts?: CreateTransactionOpts,
): Promise<{ id: string; counterparties: string[]; replayed: boolean }> {
  if (opts?.idempotency_key) {
    const existing = await tx.transaction.findUnique({
      where: { user_id_idempotency_key: { user_id, idempotency_key: opts.idempotency_key } },
      select: { id: true },
    })
    if (existing) return { id: existing.id, counterparties: [], replayed: true }
  }

  const accounting_head_ids = Array.from(new Set(line_items.map(li => li.accounting_head_id)))
  const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

  const accounts = await tx.accounting_head.findMany({
    where: { id: { in: accounting_head_ids }, user_id },
  })
  if (accounts.length !== accounting_head_ids.length)
    throw new ActionError('VALIDATION', 'One or more accounts not found or do not belong to your user')

  const assets = await tx.asset.findMany({
    where: { id: { in: asset_ids } },
  })
  if (assets.length !== asset_ids.length) throw new ActionError('VALIDATION', 'One or more assets not found')

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
      external_ref: opts?.external_ref ?? null,
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

  const counterparties = await create_links_for_transaction(tx, user_id, created.id)
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
        external_ref: parsed.data.external_ref,
        idempotency_key: parsed.data.idempotency_key,
      }),
    )

    if (replayed) return ok({ id, replayed: true }, 'Already recorded — an existing transaction matches this idempotency_key; nothing was created')

    await invalidate_balances(user_id)

    for (const cp of counterparties) void notify_request_pending(cp, user_id, { description: parsed.data.description })
    return ok({ id }, 'Transaction created successfully')
  } catch (error) {
    // Concurrent create with the same idempotency_key: the unique constraint is
    // the backstop — resolve the race to a replay instead of an error.
    const key = opts?.idempotency_key?.trim()
    if (key && error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === 'P2002') {
      const existing = await prisma.transaction.findUnique({
        where: { user_id_idempotency_key: { user_id, idempotency_key: key } },
        select: { id: true },
      })
      if (existing)
        return ok({ id: existing.id, replayed: true }, 'Already recorded — an existing transaction matches this idempotency_key; nothing was created')
    }
    logger.error({ err: error, action: 'create_transaction' }, 'Error creating transaction')
    return fromError(error)
  }
}

export type BulkTransactionInput = {
  datetime: Date
  line_items: CreateLineItemInput[]
  description?: string | null | undefined
  external_ref?: string | null | undefined
  idempotency_key?: string | null | undefined
}

// All-or-nothing bulk create: every transaction commits or none do. Items whose
// idempotency_key already exists are replayed (skipped), not treated as errors.
export async function create_transactions_core(
  user_id: string,
  items: BulkTransactionInput[],
): Promise<ActionResult<{ ids: string[]; replayed_ids: string[] }>> {
  try {
    if (items.length === 0) return err('VALIDATION', 'At least one transaction is required')

    const { results, counterparties } = await prisma.$transaction(
      async tx => {
        const results: { id: string; replayed: boolean }[] = []
        const cps = new Set<string>()
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const parsed = createTransactionSchema.safeParse({
            line_items: item.line_items,
            description: item.description,
            external_ref: item.external_ref,
            idempotency_key: item.idempotency_key,
          })
          if (!parsed.success) throw new ActionError('VALIDATION', `transaction ${i + 1}: ${parsed.error.issues[0].message}`)
          try {
            const r = await create_transaction_in_tx(tx, user_id, item.datetime, parsed.data.line_items, parsed.data.description, {
              external_ref: parsed.data.external_ref,
              idempotency_key: parsed.data.idempotency_key,
            })
            for (const cp of r.counterparties) cps.add(cp)
            results.push({ id: r.id, replayed: r.replayed })
          } catch (error) {
            if (error instanceof ActionError) throw new ActionError(error.code, `transaction ${i + 1}: ${error.message}`)
            throw error
          }
        }
        return { results, counterparties: [...cps] }
      },
      { timeout: 60_000 },
    )

    const created = results.filter(r => !r.replayed)
    if (created.length > 0) {
      await invalidate_balances(user_id)
      for (const cp of counterparties) void notify_request_pending(cp, user_id, {})
    }
    return ok(
      { ids: results.map(r => r.id), replayed_ids: results.filter(r => r.replayed).map(r => r.id) },
      `Created ${created.length} transaction${created.length === 1 ? '' : 's'}${results.length > created.length ? ` (${results.length - created.length} replayed via idempotency_key)` : ''}`,
    )
  } catch (error) {
    logger.error({ err: error, action: 'create_transactions' }, 'Error creating transactions in bulk')
    return fromError(error)
  }
}

export async function update_transaction_core(
  user_id: string,
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined,
  opts?: { external_ref?: string | null | undefined },
): Promise<ActionResult> {
  try {
    const parsed = updateTransactionSchema.safeParse({ id, line_items, description })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    line_items = parsed.data.line_items
    description = parsed.data.description
    const external_ref = opts && 'external_ref' in opts ? externalRefSchema.parse(opts.external_ref) : undefined

    await prisma.$transaction(async prisma => {
      const existing = await prisma.transaction.findUnique({
        where: { id, user_id },
      })
      if (!existing) throw new ActionError('NOT_FOUND', 'Transaction not found or does not belong to your user')

      const accounting_head_ids = Array.from(new Set(line_items.map(li => li.accounting_head_id)))
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

      const accounts = await prisma.accounting_head.findMany({
        where: { id: { in: accounting_head_ids }, user_id },
      })
      if (accounts.length !== accounting_head_ids.length)
        throw new ActionError('VALIDATION', 'One or more accounts not found or do not belong to your user')

      const assets = await prisma.asset.findMany({
        where: { id: { in: asset_ids } },
      })
      if (assets.length !== asset_ids.length) throw new ActionError('VALIDATION', 'One or more assets not found')

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
          external_ref,
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

      await sync_links_after_update(prisma, user_id, id)
    })

    await invalidate_balances(user_id)

    const pending_links = await prisma.transaction_link.findMany({
      where: {
        pending_status: 'pending',
        pending_by: { not: user_id },
        OR: [
          { user_a_id: user_id, txn_a_id: id },
          { user_b_id: user_id, txn_b_id: id },
        ],
      },
    })
    if (pending_links.length > 0) {
      const txn = await prisma.transaction.findUnique({ where: { id }, select: { description: true } })
      for (const link of pending_links) {
        const cp = link.user_a_id === user_id ? link.user_b_id : link.user_a_id
        void notify_request_pending(cp, user_id, { changed: true, description: txn?.description ?? null })
      }
    }
    return ok(undefined, 'Transaction updated successfully')
  } catch (error) {
    logger.error({ err: error, action: 'update_transaction' }, 'Error updating transaction')
    return fromError(error)
  }
}

export async function delete_transaction_core(user_id: string, id: string): Promise<ActionResult> {
  try {
    const parsed = deleteTransactionSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    await prisma.$transaction(async tx => {
      await prepare_links_for_delete(tx, user_id, id)
      await tx.transaction.delete({ where: { id, user_id } })
    })
    await invalidate_balances(user_id)
    return ok()
  } catch (error) {
    return fromError(error)
  }
}

const upiPaymentSchema = z.object({
  payee_account_id: z.string().min(1, 'payee account is required'),
  amount: z.number().positive('amount must be positive'),
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

    const [user_row, payee, rupees_assets] = await Promise.all([
      prisma.user.findUnique({ where: { id: user_id }, select: { default_account_id: true, default_asset_id: true } }),
      prisma.accounting_head.findFirst({
        where: { id: parsed.data.payee_account_id, user_id, type: 'account' },
        select: { id: true },
      }),
      prisma.asset.findMany({
        where: { type: asset_type.rupees, is_active: true },
        select: { id: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
    ])

    if (!user_row?.default_account_id) return err('NOT_FOUND', 'No default account set — pick one in Settings → Preferences')
    if (!payee) return err('NOT_FOUND', 'Payee account not found')
    if (parsed.data.payee_account_id === user_row.default_account_id) return err('VALIDATION', "Payee can't be the same as your default account")
    if (rupees_assets.length === 0) return err('NOT_FOUND', 'You need a rupees asset to record a payment')

    const rupees_asset_id = rupees_assets.find(a => a.id === user_row.default_asset_id)?.id ?? rupees_assets[0].id
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
      const accounts = await prisma.accounting_head.findMany({
        where: { id: { in: [user_row.default_account_id!, parsed.data.payee_account_id] }, user_id },
      })
      const assets = await prisma.asset.findMany({ where: { id: rupees_asset_id } })
      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: li.quantity,
          txn_value: li.txn_value,
          asset: assets.find(a => a.id === li.asset_id)!,
          accounting_head: accounts.find(a => a.id === li.accounting_head_id)!,
        })),
      )
      if (!is_valid) throw new ActionError('VALIDATION', message)

      const created = await prisma.transaction.create({ data: { datetime, description, user_id, line_items: { create: line_items } } })
      const counterparties = await create_links_for_transaction(prisma, user_id, created.id)
      return { id: created.id, counterparties }
    })

    await invalidate_balances(user_id)

    for (const cp of counterparties) void notify_request_pending(cp, user_id, { description })
    return ok({ id }, 'Payment recorded')
  } catch (error) {
    logger.error({ err: error, action: 'create_upi_payment' }, 'Error creating UPI payment')
    return fromError(error)
  }
}
