'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user } from './auth'
import { CreateLineItemInput } from './transactions'
import { revalidatePath } from 'next/cache'

export async function create_transaction_template(
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<{ success: boolean; message: string; template: any }> {
  try {
    const user = await get_current_user()
    if (!user) throw new Error('Not authenticated')
    const user_id = user.id
    if (line_items.length === 0) throw new Error('At least one line item is required')

    if (description) description = description.trim()
    if (description === '') description = null

    // We can compute null inputs or just save them verbatim

    const template = await prisma.transaction_template.create({
      data: {
        user_id,
        description,
        line_items: {
          create: line_items.map(li => ({
            account_id: li.account_id,
            asset_id: li.asset_id,
            quantity: li.quantity,
            book_value: li.book_value,
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
  const user = await get_current_user()
  if (!user) throw new Error('Not authenticated')
  const user_id = user.id
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

export async function delete_transaction_template(id: string) {
  try {
    const user = await get_current_user()
    if (!user) throw new Error('Not authenticated')
    const user_id = user.id
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
