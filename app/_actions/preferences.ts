'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from './auth'
import { ActionResult, ok, err, fromError } from './_result'
import { revalidatePath } from 'next/cache'

export type LineItemDefaults = {
  default_account_id: string | null
  default_allocation_id: string | null
  default_income_expense_id: string | null
  default_asset_id: string | null
}

const updateSchema = z.object({
  default_account_id: z.string().min(1).nullable(),
  default_allocation_id: z.string().min(1).nullable(),
  default_income_expense_id: z.string().min(1).nullable(),
  default_asset_id: z.string().min(1).nullable(),
})

export async function get_line_item_defaults(): Promise<LineItemDefaults> {
  const user_id = await get_current_user_id()
  if (!user_id) {
    return {
      default_account_id: null,
      default_allocation_id: null,
      default_income_expense_id: null,
      default_asset_id: null,
    }
  }
  const u = await prisma.user.findUnique({
    where: { id: user_id },
    select: {
      default_account_id: true,
      default_allocation_id: true,
      default_income_expense_id: true,
      default_asset_id: true,
    },
  })
  return (
    u ?? {
      default_account_id: null,
      default_allocation_id: null,
      default_income_expense_id: null,
      default_asset_id: null,
    }
  )
}

export async function update_line_item_defaults(input: LineItemDefaults): Promise<ActionResult<LineItemDefaults>> {
  try {
    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')

    const parsed = updateSchema.parse(input)

    // Validate ownership and accounting_head_type for the chosen IDs.
    const accountIds = [
      { id: parsed.default_account_id, type: 'account' as const, label: 'account' },
      { id: parsed.default_allocation_id, type: 'allocation' as const, label: 'allocation' },
      { id: parsed.default_income_expense_id, type: 'income_expense' as const, label: 'income_expense' },
    ].filter(x => x.id)
    if (accountIds.length > 0) {
      const found = await prisma.accounting_head.findMany({
        where: { id: { in: accountIds.map(x => x.id!) }, user_id },
        select: { id: true, type: true },
      })
      const byId = new Map(found.map(a => [a.id, a]))
      for (const x of accountIds) {
        const acc = byId.get(x.id!)
        if (!acc) return err('NOT_FOUND', `Default ${x.label} account not found`)
        if (acc.type !== x.type) return err('VALIDATION', `Default ${x.label} account must be of type ${x.label}`)
      }
    }
    if (parsed.default_asset_id) {
      const asset = await prisma.asset.findFirst({
        where: { id: parsed.default_asset_id, user_id },
        select: { id: true },
      })
      if (!asset) return err('NOT_FOUND', 'Default asset not found')
    }

    const updated = await prisma.user.update({
      where: { id: user_id },
      data: parsed,
      select: {
        default_account_id: true,
        default_allocation_id: true,
        default_income_expense_id: true,
        default_asset_id: true,
      },
    })

    revalidatePath('/transactions/create')
    revalidatePath('/transactions')
    revalidatePath('/settings')

    return ok(updated, 'Defaults saved')
  } catch (error) {
    return fromError(error)
  }
}
