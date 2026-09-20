'use server'

import { revalidatePath } from 'next/cache'
import { get_current_user_id } from './auth'
import { ActionResult, err } from './_result'
import {
  list_transaction_groups_core,
  list_group_names_core,
  get_transaction_group_core,
  create_transaction_group_core,
  update_transaction_group_core,
  delete_transaction_group_core,
  set_transaction_groups_core,
  add_transactions_to_group_core,
  remove_transactions_from_group_core,
} from '@/app/_core/groups_core'

function revalidate_groups(id?: string) {
  revalidatePath('/groups')
  if (id) revalidatePath(`/groups/${id}`)
  revalidatePath('/transactions')
}

export async function list_group_names(): Promise<{ id: string; name: string }[]> {
  const user_id = await get_current_user_id()
  if (!user_id) return []
  return list_group_names_core(user_id)
}

export async function list_transaction_groups() {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('Your session has expired — log in again')
  return list_transaction_groups_core(user_id)
}

export async function get_transaction_group(id: string) {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('Your session has expired — log in again')
  return get_transaction_group_core(user_id, id)
}

export async function create_transaction_group(input: {
  name: string
  description?: string | null | undefined
}): Promise<ActionResult<{ id: string; name: string }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to create groups')
  const res = await create_transaction_group_core(user_id, input)
  if (res.success) revalidate_groups()
  return res
}

export async function update_transaction_group(
  id: string,
  input: { name?: string | undefined; description?: string | null | undefined },
): Promise<ActionResult<{ id: string; name: string }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to edit groups')
  const res = await update_transaction_group_core(user_id, id, input)
  if (res.success) revalidate_groups(id)
  return res
}

export async function delete_transaction_group(id: string): Promise<ActionResult<{ member_count: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to delete groups')
  const res = await delete_transaction_group_core(user_id, id)
  if (res.success) revalidate_groups(id)
  return res
}

/** Replace a transaction's whole group membership — what the chip picker saves. */
export async function set_transaction_groups(transaction_id: string, group_ids: string[]): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  const res = await set_transaction_groups_core(user_id, transaction_id, group_ids)
  if (res.success) {
    revalidate_groups()
    revalidatePath(`/transactions/${transaction_id}`)
  }
  return res
}

export async function add_transactions_to_group(group_id: string, transaction_ids: string[]): Promise<ActionResult<{ added: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  const res = await add_transactions_to_group_core(user_id, group_id, transaction_ids)
  if (res.success) revalidate_groups(group_id)
  return res
}

export async function remove_transactions_from_group(group_id: string, transaction_ids: string[]): Promise<ActionResult<{ removed: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  const res = await remove_transactions_from_group_core(user_id, group_id, transaction_ids)
  if (res.success) revalidate_groups(group_id)
  return res
}
