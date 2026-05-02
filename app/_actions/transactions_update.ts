'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { CreateLineItemInput } from './transactions'
import { validate_line_items } from '../_utils/validate_line_items'
import { toDecimal } from '../_utils/decimal'
import { get_or_compute_balances } from './compute_balances'
import { z } from 'zod'

const updateTransactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
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

export async function update_transaction(
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined,
): Promise<{ success: boolean; message: string }> {
  try {
    const parsed = updateTransactionSchema.safeParse({ id, line_items, description })
    if (!parsed.success) throw new Error(parsed.error.issues[0].message)
    id = parsed.data.id
    line_items = parsed.data.line_items
    description = parsed.data.description

    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('You must be logged in to update transactions')

    await prisma.$transaction(async prisma => {
      // ensure transaction exists and belongs to user
      const existing = await prisma.transaction.findUnique({
        where: { id, user_id },
      })
      if (!existing) throw new Error('Transaction not found or does not belong to your user')

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

    await get_or_compute_balances(true)

    return {
      success: true,
      message: 'Transaction updated successfully',
    }
  } catch (error) {
    console.error('Error updating transaction:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update transaction',
    }
  }
}
