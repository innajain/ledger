'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { create_transaction_core, delete_transaction_core, create_upi_payment_core, type CreateLineItemInput } from '@/app/_core/transactions_core'
import { ActionResult, err } from './_result'

export type { CreateLineItemInput }

export async function create_transaction(
  datetime: Date,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<ActionResult<{ id: string }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to create transactions')
  return create_transaction_core(user_id, datetime, line_items, description)
}

export async function delete_transaction(id: string): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  return delete_transaction_core(user_id, id)
}

export async function create_upi_payment(input: {
  payee_account_id: string
  amount: number
  description?: string | null | undefined
}): Promise<ActionResult<{ id: string }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  return create_upi_payment_core(user_id, input)
}
