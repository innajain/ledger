'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { Prisma } from '@/generated/prisma/client'
import { validate_line_items } from '../_utils/validate_line_items'
import { get_or_compute_balances } from './compute_balances'

export type CreateLineItemInput = {
  account_id: string
  asset_id: string
  quantity?: number
  book_value?: number | null | undefined
  description?: string | null | undefined
  datetime?: Date | null | undefined
}

export async function create_transaction(
  datetime: Date,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<{ success: boolean; message: string; id?: string }> {
  try {
    if (line_items.length === 0) throw new Error('At least one line item is required')
    if (description) description = description.trim()
    if (description === '') description = null
    line_items.forEach(li => {
      if (li.description) li.description = li.description.trim()
      if (li.description === '') li.description = null
    })

    const user = await get_current_user()
    if (!user) throw new Error('You must be logged in to create transactions')

    const { id } = await prisma.$transaction(async prisma => {
      const account_ids = Array.from(new Set(line_items.map(li => li.account_id)))
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

      const accounts = await prisma.account.findMany({
        where: { id: { in: account_ids }, user_id: user.id },
      })
      if (accounts.length !== account_ids.length) throw new Error('One or more accounts not found or do not belong to your user')

      const assets = await prisma.asset.findMany({
        where: { id: { in: asset_ids }, user_id: user.id },
      })
      if (assets.length !== asset_ids.length) throw new Error('One or more assets not found or do not belong to your user')

      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: li.quantity === null || li.quantity === undefined ? null : new Prisma.Decimal(li.quantity),
          book_value: li.book_value === null || li.book_value === undefined ? null : new Prisma.Decimal(li.book_value),
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
          user_id: user.id,
          line_items: {
            create: line_items.map(li => ({
              quantity: li.quantity === null || li.quantity === undefined ? null : new Prisma.Decimal(li.quantity),
              book_value: li.book_value == null ? null : new Prisma.Decimal(li.book_value),
              account_id: li.account_id,
              asset_id: li.asset_id,
              description: li.description !== undefined && li.description !== null && li.description.length === 0 ? null : li.description,
              datetime: li.datetime,
            })),
          },
        },
      })
    })

    await get_or_compute_balances(true)
    return {
      success: true,
      message: 'Transaction created successfully',
      id,
    }
  } catch (error) {
    console.error('Error creating transaction:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create transaction',
    }
  }
}

export async function delete_transaction(id: string): Promise<void> {
  if (id.length === 0) throw new Error('id is required')

  const user = await get_current_user()
  if (!user) throw new Error('unauthorized')

  await prisma.transaction.delete({ where: { id, user_id: user.id } })
}
