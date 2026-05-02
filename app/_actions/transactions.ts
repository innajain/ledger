'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { z } from 'zod'
import { validate_line_items } from '../_utils/validate_line_items'
import { toDecimal } from '../_utils/decimal'
import { invalidate_balances } from './compute_balances'
import { logger } from '@/lib/logger'

export type CreateLineItemInput = {
  account_id: string
  asset_id: string
  quantity?: number
  book_value?: number | null | undefined
  description?: string | null | undefined
  datetime?: Date | null | undefined
}

const createTransactionSchema = z.object({
  line_items: z
    .array(
      z.object({
        account_id: z.string(),
        asset_id: z.string(),
        quantity: z.number().optional(),
        book_value: z.number().nullish(),
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
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    const parsed = createTransactionSchema.safeParse({ line_items, description })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)

    // safeParse can't cleanly overwrite the function arguments with identical types nicely when nullish is involved so we take what we need
    line_items = parsed.data.line_items
    description = parsed.data.description

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('You must be logged in to create transactions')

    const { id } = await prisma.$transaction(async prisma => {
      const account_ids = Array.from(new Set(line_items.map(li => li.account_id)))
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

      const accounts = await prisma.account.findMany({
        where: { id: { in: account_ids }, user_id },
      })
      if (accounts.length !== account_ids.length) throw new Error('One or more accounts not found or do not belong to your user')

      const assets = await prisma.asset.findMany({
        where: { id: { in: asset_ids }, user_id },
      })
      if (assets.length !== asset_ids.length) throw new Error('One or more assets not found or do not belong to your user')

      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: toDecimal(li.quantity),
          book_value: toDecimal(li.book_value),
          asset: assets.find(a => a.id === li.asset_id)!,
          account: accounts.find(a => a.id === li.account_id)!,
        })),
      )

      if (!is_valid) throw new Error(message)

      // All checks passed — create the transaction with nested line_items
      return await prisma.transaction.create({
        data: {
          datetime,
          description,
          user_id,
          line_items: {
            create: line_items.map(li => ({
              quantity: toDecimal(li.quantity),
              book_value: toDecimal(li.book_value),
              account_id: li.account_id,
              asset_id: li.asset_id,
              description: li.description,
              datetime: li.datetime,
            })),
          },
        },
      })
    })

    await invalidate_balances(user_id)
    return {
      success: true,
      message: 'Transaction created successfully',
      id,
    }
  } catch (error) {
    logger.error({ err: error, action: 'create_transaction' }, 'Error creating transaction')
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create transaction',
    }
  }
}

const deleteTransactionSchema = z.object({
  id: z.string().min(1, 'id is required'),
})

export async function delete_transaction(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = deleteTransactionSchema.safeParse({ id })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    id = parsed.data.id

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('unauthorized')

    await prisma.transaction.delete({ where: { id, user_id } })
    await invalidate_balances(user_id)
    return { success: true, message: '' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}
