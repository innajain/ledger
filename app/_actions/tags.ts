'use server'

import { revalidatePath } from 'next/cache'
import { get_current_user_id } from './auth'
import { ActionResult, err } from './_result'
import {
  list_transaction_tags_core,
  list_tag_names_core,
  get_transaction_tag_core,
  create_transaction_tag_core,
  update_transaction_tag_core,
  delete_transaction_tag_core,
  set_transaction_tags_core,
  add_transactions_to_tag_core,
  remove_transactions_from_tag_core,
} from '@/app/_core/tags_core'

function revalidate_tags(id?: string) {
  revalidatePath('/tags')
  if (id) revalidatePath(`/tags/${id}`)
  revalidatePath('/transactions')
}

export async function list_tag_names(): Promise<{ id: string; name: string }[]> {
  const user_id = await get_current_user_id()
  if (!user_id) return []
  return list_tag_names_core(user_id)
}

export async function list_transaction_tags() {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('Your session has expired — log in again')
  return list_transaction_tags_core(user_id)
}

export async function get_transaction_tag(id: string) {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('Your session has expired — log in again')
  return get_transaction_tag_core(user_id, id)
}

export async function create_transaction_tag(input: {
  name: string
  description?: string | null | undefined
}): Promise<ActionResult<{ id: string; name: string }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to create tags')
  const res = await create_transaction_tag_core(user_id, input)
  if (res.success) revalidate_tags()
  return res
}

export async function update_transaction_tag(
  id: string,
  input: { name?: string | undefined; description?: string | null | undefined },
): Promise<ActionResult<{ id: string; name: string }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to edit tags')
  const res = await update_transaction_tag_core(user_id, id, input)
  if (res.success) revalidate_tags(id)
  return res
}

export async function delete_transaction_tag(id: string): Promise<ActionResult<{ member_count: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to delete tags')
  const res = await delete_transaction_tag_core(user_id, id)
  if (res.success) revalidate_tags(id)
  return res
}

/** Replace a transaction's whole tag membership — what the chip picker saves. */
export async function set_transaction_tags(transaction_id: string, tag_ids: string[]): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  const res = await set_transaction_tags_core(user_id, transaction_id, tag_ids)
  if (res.success) {
    revalidate_tags()
    revalidatePath(`/transactions/${transaction_id}`)
  }
  return res
}

export async function add_transactions_to_tag(tag_id: string, transaction_ids: string[]): Promise<ActionResult<{ added: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  const res = await add_transactions_to_tag_core(user_id, tag_id, transaction_ids)
  if (res.success) revalidate_tags(tag_id)
  return res
}

export async function remove_transactions_from_tag(tag_id: string, transaction_ids: string[]): Promise<ActionResult<{ removed: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'You must be logged in')
  const res = await remove_transactions_from_tag_core(user_id, tag_id, transaction_ids)
  if (res.success) revalidate_tags(tag_id)
  return res
}
