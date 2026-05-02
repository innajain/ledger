'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from './auth'
import { CreateLineItemInput } from './transactions'
import { toDecimal } from '../_utils/decimal'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const templateSchema = z.object({
  description: z
    .string()
    .trim()
    .transform(val => (val === '' ? null : val))
    .nullish(),
})

export async function create_transaction_template(
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<{ success: boolean; message: string; template: any }> {
  try {
    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('Not authenticated')
    if (line_items.length === 0) throw new Error('At least one line item is required')

    description = templateSchema.parse({ description }).description

    const template = await prisma.transaction_template.create({
      data: {
        user_id,
        description,
        line_items: {
          create: line_items.map(li => ({
            account_id: li.account_id,
            asset_id: li.asset_id,
            quantity: toDecimal(li.quantity),
            book_value: toDecimal(li.book_value),
            description: li.description || null,
          })),
        },
      },
      include: { line_items: true },
    })

    revalidatePath('/transactions')
    revalidatePath('/transactions/create')

    return { success: true, message: 'Template created', template }
  } catch (err: any) {
    return { success: false, message: err.message, template: null }
  }
}

export async function get_transaction_templates() {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('Not authenticated')
  return prisma.transaction_template.findMany({
    where: { user_id },
    include: {
      line_items: {
        include: {
          account: { select: { name: true, type: true } },
          asset: { select: { name: true, type: true } },
        },
      },
    },
    orderBy: { description: 'asc' },
  })
}

export async function update_transaction_template(
  id: string,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<{ success: boolean; message: string; template: any }> {
  try {
    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('Not authenticated')
    if (line_items.length === 0) throw new Error('At least one line item is required')

    description = templateSchema.parse({ description }).description

    // First check if it belongs to user
    const existing = await prisma.transaction_template.findUnique({
      where: { id, user_id },
    })
    if (!existing) throw new Error('Template not found or unauthorized')

    const template = await prisma.transaction_template.update({
      where: { id },
      data: {
        description,
        line_items: {
          deleteMany: {}, // Cascade deletes existing items
          create: line_items.map(li => ({
            account_id: li.account_id,
            asset_id: li.asset_id,
            quantity: toDecimal(li.quantity),
            book_value: toDecimal(li.book_value),
            description: li.description || null,
          })),
        },
      },
      include: { line_items: true },
    })

    revalidatePath('/transactions')
    revalidatePath('/transactions/create')

    return { success: true, message: 'Template updated', template }
  } catch (err: any) {
    return { success: false, message: err.message, template: null }
  }
}

export async function delete_transaction_template(id: string) {
  try {
    const user_id = await get_current_user_id()
    if (!user_id) throw new Error('Not authenticated')
    await prisma.transaction_template.delete({
      where: { id, user_id },
    })
    revalidatePath('/transactions')
    revalidatePath('/transactions/create')
    return { success: true }
  } catch (err: any) {
    return { success: false, message: err.message }
  }
}
