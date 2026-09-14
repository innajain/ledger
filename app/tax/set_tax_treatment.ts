'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'
import { logger } from '@/lib/logger'
import type { tax_treatment } from '@/generated/prisma/client'

// Tag an income/expense head with a tax treatment (or clear it, null).
// User-scoped: the head must belong to the caller. Only income/expense heads
// can carry a classification.
export async function set_tax_treatment(head_id: string, treatment: tax_treatment | null): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    const existing = await prisma.accounting_head.findUnique({
      where: { id: head_id, user_id },
      select: { type: true },
    })
    if (!existing) return err('NOT_FOUND', 'head not found')
    if (existing.type !== 'income_expense') return err('VALIDATION', 'A tax treatment applies to income/expense heads only')
    await prisma.accounting_head.update({ where: { id: head_id, user_id }, data: { tax_treatment: treatment } })
    return ok()
  } catch (error) {
    logger.error({ err: error }, 'set_tax_treatment failed')
    return fromError(error)
  }
}
