'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { z } from 'zod'
import { asset_type } from '@/generated/prisma/enums'
import { validate_line_items } from '../_utils/validate_line_items'
import { toDecimal } from '../_utils/decimal'
import { invalidate_balances } from './compute_balances'
import { create_links_for_transaction, prepare_links_for_delete } from '../_utils/links'
import { logger } from '@/lib/logger'
import { ActionResult, ok, err, fromError } from './_result'

export type CreateLineItemInput = {
  accounting_head_id: string
  asset_id: string
  quantity?: number
  txn_value?: number | null | undefined
  description?: string | null | undefined
  datetime?: Date | null | undefined
}

const createTransactionSchema = z.object({
  line_items: z
    .array(
      z.object({
        accounting_head_id: z.string(),
        asset_id: z.string(),
        quantity: z.number().optional(),
        txn_value: z.number().nullish(),
        description: z
          .string()
          .trim()
          .transform(val => (val === '' ? null : val))
          .nullish(),
        datetime: z.date().nullish(),
      }),
    )
    .min(1, 'At least one line item is required'),
  description: z
    .string()
    .trim()
    .transform(val => (val === '' ? null : val))
    .nullish(),
})

export async function create_transaction(
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

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to create transactions')

    const { id } = await prisma.$transaction(async prisma => {
      const accounting_head_ids = Array.from(new Set(line_items.map(li => li.accounting_head_id)))
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

      const accounts = await prisma.accounting_head.findMany({
        where: { id: { in: accounting_head_ids }, user_id },
      })
      if (accounts.length !== accounting_head_ids.length) throw new Error('One or more accounts not found or do not belong to your user')

      const assets = await prisma.asset.findMany({
        where: { id: { in: asset_ids } },
      })
      if (assets.length !== asset_ids.length) throw new Error('One or more assets not found')

      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: toDecimal(li.quantity),
          txn_value: toDecimal(li.txn_value),
          asset: assets.find(a => a.id === li.asset_id)!,
          accounting_head: accounts.find(a => a.id === li.accounting_head_id)!,
        })),
      )

      if (!is_valid) throw new Error(message)

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
      await create_links_for_transaction(prisma, user_id, created.id)
      return created
    })

    await invalidate_balances(user_id)
    return ok({ id }, 'Transaction created successfully')
  } catch (error) {
    logger.error({ err: error, action: 'create_transaction' }, 'Error creating transaction')
    return fromError(error)
  }
}

const deleteTransactionSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function delete_transaction(id: string): Promise<ActionResult> {
  try {
    const parsed = deleteTransactionSchema.safeParse({ id })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'unauthorized')

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
    .transform(val => (val === '' ? null : val))
    .nullish(),
})

/**
 * Convenience action for "I just paid X via UPI" flows. Builds a minimal
 * two-line rupees transaction: -amount on the user's default account,
 * +amount on the payee account. No allocation / income_expense lines.
 *
 * Returns NOT_FOUND if the user hasn't set a default account, or if no
 * rupees asset is owned by the user.
 */
export async function create_upi_payment(input: {
  payee_account_id: string
  amount: number
  description?: string | null | undefined
}): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = upiPaymentSchema.safeParse(input)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')

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

    // Prefer the user's default asset if it happens to be rupees; otherwise
    // fall back to the first rupees asset they own.
    const rupees_asset_id = rupees_assets.find(a => a.id === user_row.default_asset_id)?.id ?? rupees_assets[0].id

    const description = parsed.data.description ?? null
    const datetime = new Date()

    const { id } = await prisma.$transaction(async prisma => {
      const line_items = [
        // Money leaves the default account
        {
          accounting_head_id: user_row.default_account_id!,
          asset_id: rupees_asset_id,
          quantity: toDecimal(-parsed.data.amount),
          txn_value: null,
          description,
          datetime: null,
        },
        // Money arrives at the payee account (settling negative balance / fresh debit)
        {
          accounting_head_id: parsed.data.payee_account_id,
          asset_id: rupees_asset_id,
          quantity: toDecimal(parsed.data.amount),
          txn_value: null,
          description,
          datetime: null,
        },
      ]

      // Re-use the shared validator so we error early on the same rules the
      // manual create form enforces.
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
      if (!is_valid) throw new Error(message)

      return await prisma.transaction.create({
        data: {
          datetime,
          description,
          user_id,
          line_items: { create: line_items },
        },
      })
    })

    await invalidate_balances(user_id)
    return ok({ id }, 'Payment recorded')
  } catch (error) {
    logger.error({ err: error, action: 'create_upi_payment' }, 'Error creating UPI payment')
    return fromError(error)
  }
}
