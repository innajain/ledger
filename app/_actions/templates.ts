'use server'

import { get_current_user_id } from './auth'
import { CreateLineItemInput } from './transactions'
import { revalidatePath } from 'next/cache'
import { ActionResult, err } from './_result'
import {
  type TemplateWithLineItems,
  create_transaction_template_core,
  get_transaction_templates_core,
  update_transaction_template_core,
  delete_transaction_template_core,
} from '@/app/_core/templates_core'

function revalidate_templates() {
  revalidatePath('/transactions')
  revalidatePath('/transactions/create')
}

export async function create_transaction_template(
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<ActionResult<TemplateWithLineItems>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  const res = await create_transaction_template_core(user_id, line_items, description)
  if (res.success) revalidate_templates()
  return res
}

export async function get_transaction_templates() {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('Not authenticated')
  return get_transaction_templates_core(user_id)
}

export async function update_transaction_template(
  id: string,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<ActionResult<TemplateWithLineItems>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  const res = await update_transaction_template_core(user_id, id, line_items, description)
  if (res.success) revalidate_templates()
  return res
}

export async function delete_transaction_template(id: string): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  const res = await delete_transaction_template_core(user_id, id)
  if (res.success) revalidate_templates()
  return res
}
