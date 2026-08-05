'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { update_transaction_core, type CreateLineItemInput } from '@/app/_core/transactions_core'
import { ActionResult, err } from '@/app/_actions/_result'

export async function update_transaction(
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined,
  opts?: { external_ref?: string | null | undefined },
): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to update transactions')
  return update_transaction_core(user_id, id, line_items, datetime, description, opts)
}
