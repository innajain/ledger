/**
 * Framework-agnostic transaction write logic, shared by the web server actions
 * (`app/_actions/transactions.ts`, `app/transactions/[id]/update/transactions_update.ts`)
 * and the CLI. Each function takes an explicit `user_id` and returns the same
 * `ActionResult<T>` the actions always have. All cross-user approval side-effects
 * (links.ts) and balance invalidation live here, so both surfaces stay identical.
 */
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

const createTransactionSchema = z.object({
  line_items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  description: descriptionSchema,
})

const updateTransactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
  line_items: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  description: descriptionSchema,
})

const deleteTransactionSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function create_transaction_core(
  user_id: string,
  datetime: Date,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createTransactionSchema.safeParse({ line_items, description })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    // safeParse can't cleanly overwrite the function arguments with identical types nicely when nullish is involved so we take what we need
    line_items = parsed.data.line_items
    description = parsed.data.description

    const { id, counterparties } = await prisma.$transaction(async prisma => {
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

      // All checks passed — create the transaction with nested line_items
      const created = await prisma.transaction.create({
        data: {
          datetime,
          description,
          user_id,
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
      // Open an approval request per linked-account counterparty (if any).
      const counterparties = await create_links_for_transaction(prisma, user_id, created.id)
      return { id: created.id, counterparties }
    })

    await invalidate_balances(user_id)
    // Ping each counterparty whose approval the new transaction now awaits.
    for (const cp of counterparties) void notify_request_pending(cp, user_id, { description })
    return ok({ id }, 'Transaction created successfully')
  } catch (error) {
    logger.error({ err: error, action: 'create_transaction' }, 'Error creating transaction')
    return fromError(error)
  }
}

export async function update_transaction_core(
  user_id: string,
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateTransactionSchema.safeParse({ id, line_items, description })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    line_items = parsed.data.line_items
    description = parsed.data.description

    await prisma.$transaction(async prisma => {
      // ensure transaction exists and belongs to user
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
      // Replace line items: delete existing then add new ones, and update transaction
      await prisma.line_item.deleteMany({ where: { transaction_id: id } })

      await prisma.transaction.update({
        where: { id, user_id },
        data: {
          datetime,
          description,
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

      // Reconcile cross-user approval links: re-open requests for counterparties
      // whose linked lines changed, add links for new ones (throws on the anchor
      // hard-block or on removing a shared portion).
      await sync_links_after_update(prisma, user_id, id)
    })

    await invalidate_balances(user_id)

    // Notify counterparties whose approval this edit now awaits (re-opened links).
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
      // Approved shared copies become deletion requests; never-approved links drop.
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

/**
 * Convenience: "I just paid X via UPI". Builds a minimal two-line rupees
 * transaction — −amount on the user's default account, +amount on the payee
 * account. Returns NOT_FOUND if no default account / no rupees asset.
 */
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

    const { id } = await prisma.$transaction(async prisma => {
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

      return await prisma.transaction.create({ data: { datetime, description, user_id, line_items: { create: line_items } } })
    })

    await invalidate_balances(user_id)
    return ok({ id }, 'Payment recorded')
  } catch (error) {
    logger.error({ err: error, action: 'create_upi_payment' }, 'Error creating UPI payment')
    return fromError(error)
  }
}
