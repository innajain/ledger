'use server'

import { z } from 'zod'
import { get_current_user_id, require_admin } from '@/app/_actions/auth'
import type { accounting_head_type, asset_type, tax_treatment } from '@/generated/prisma/client'
import {
  find_user_by_username_core,
  create_account_core,
  update_account_core,
  delete_account_core,
  create_asset_core,
  update_asset_core,
  delete_asset_core,
  reorder_heads_core,
  reorder_assets_core,
} from '@/app/_core/resources_core'
import { ActionResult, err } from './_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

export async function find_user_by_username(username: string): Promise<ActionResult<{ id: string; username: string }>> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return find_user_by_username_core(me, username)
}

export async function create_account(
  name: string,
  type: accounting_head_type,
  parent_id?: string | null,
  linked_user_id?: string | null,
): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  return create_account_core(user_id, name, type, parent_id, linked_user_id)
}

export async function update_account(
  id: string,
  name?: string | undefined,
  type?: accounting_head_type | undefined,
  parent_id?: string | null | undefined,
  is_active?: boolean | undefined,
  is_placeholder?: boolean | undefined,
  linked_user_id?: string | null | undefined,
  lock_date?: Date | null | undefined,
  tax_treatment?: tax_treatment | null | undefined,
): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  return update_account_core(user_id, id, name, type, parent_id, is_active, is_placeholder, linked_user_id, lock_date, tax_treatment)
}

export async function delete_account(id: string): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  return delete_account_core(user_id, id)
}

export async function create_asset(
  name: string,
  type: asset_type,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined,
): Promise<ActionResult> {
  let admin_id: string
  try {
    admin_id = await require_admin()
  } catch (error) {
    return reportActionError(error, { action: 'asset.require_admin.create', entity: 'asset' })
  }
  const result = await create_asset_core(name, type, ticker, parent_id)
  if (result.success) audit('asset.create', admin_id, { asset_type: type })
  return result
}

export async function update_asset(
  id: string,
  name?: string | undefined,
  type?: asset_type | undefined,
  ticker?: string | null | undefined,
  parent_id?: string | null | undefined,
  is_active?: boolean | undefined,
  is_placeholder?: boolean | undefined,
): Promise<ActionResult> {
  let admin_id: string
  try {
    admin_id = await require_admin()
  } catch (error) {
    return reportActionError(error, { action: 'asset.require_admin.update', entity: 'asset' })
  }
  const result = await update_asset_core(id, name, type, ticker, parent_id, is_active, is_placeholder)
  if (result.success) audit('asset.update', admin_id)
  return result
}

export async function delete_asset(id: string): Promise<ActionResult> {
  let admin_id: string
  try {
    admin_id = await require_admin()
  } catch (error) {
    return reportActionError(error, { action: 'asset.require_admin.delete', entity: 'asset' })
  }
  const result = await delete_asset_core(id)
  if (result.success) audit('asset.delete', admin_id)
  return result
}

const updateHierarchyOrderSchema = z.object({
  scope: z.enum(['account', 'asset']),
  parent_id: z.string().nullable(),
  ordered_ids: z.array(z.string().min(1)).min(1),
})

export async function update_hierarchy_order(input: {
  scope: 'account' | 'asset'
  parent_id: string | null
  ordered_ids: string[]
}): Promise<ActionResult> {
  try {
    const parsed = updateHierarchyOrderSchema.safeParse(input)
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)

    const { scope, parent_id, ordered_ids } = parsed.data

    if (scope === 'account') {
      const user_id = await get_current_user_id()
      if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
      return reorder_heads_core(user_id, parent_id, ordered_ids)
    }
    const admin_id = await require_admin()
    const result = await reorder_assets_core(parent_id, ordered_ids)
    if (result.success) audit('asset.reorder', admin_id, { item_count: ordered_ids.length })
    return result
  } catch (error) {
    return reportActionError(error, { action: 'resource.reorder' })
  }
}
