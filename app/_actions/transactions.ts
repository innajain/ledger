'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import {
  create_transaction_core,
  delete_transaction_core,
  create_upi_payment_core,
  type CreateLineItemInput,
  type CreateTransactionOpts,
} from '@/app/_core/transactions_core'
import { ActionResult, err, ok, fromError } from './_result'

export async function create_transaction(
  datetime: Date,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
  opts?: CreateTransactionOpts,
): Promise<ActionResult<{ id: string; replayed?: boolean }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to create transactions')
  return create_transaction_core(user_id, datetime, line_items, description, opts)
}

export async function delete_transaction(id: string): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  const res = await delete_transaction_core(user_id, id)
  return res.success ? ok(undefined, res.message) : res
}

export type DeletedTransactionSnapshot = {
  datetime: string
  description: string | null
  had_attachments: boolean
  line_items: CreateLineItemInput[]
}

// Delete returning a re-creatable snapshot so the UI can offer an Undo
// (attachments are not restorable — their rows cascade away on delete).
export async function delete_transaction_with_snapshot(id: string): Promise<ActionResult<{ snapshot: DeletedTransactionSnapshot }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    const res = await delete_transaction_core(user_id, id)
    if (!res.success) return res
    const deleted = res.data!
    const snapshot: DeletedTransactionSnapshot = {
      datetime: deleted.datetime.toISOString(),
      description: deleted.description,
      had_attachments: deleted.had_attachments,
      line_items: deleted.line_items.map(li => ({
        accounting_head_id: li.accounting_head_id,
        asset_id: li.asset_id,
        quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
        txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
        description: li.description,
        datetime: li.datetime,
      })),
    }
    return ok({ snapshot })
  } catch (error) {
    return fromError(error)
  }
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
