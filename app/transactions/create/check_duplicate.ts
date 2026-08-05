'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { find_possible_duplicate, type CreateLineItemInput, type PossibleDuplicate } from '@/app/_core/transactions_core'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'

export async function check_possible_duplicate(
  datetime: Date,
  line_items: CreateLineItemInput[],
): Promise<ActionResult<{ duplicate: PossibleDuplicate | null }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    return ok({ duplicate: await find_possible_duplicate(user_id, datetime, line_items) })
  } catch (error) {
    return fromError(error)
  }
}
