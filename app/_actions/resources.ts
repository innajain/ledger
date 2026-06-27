'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { get_current_user_id, require_admin } from '@/app/_actions/auth'
import type { accounting_head_type, asset_type } from '@/generated/prisma/client'
import {
  find_user_by_username_core,
  create_account_core,
  update_account_core,
  delete_account_core,
  create_asset_core,
  update_asset_core,
  delete_asset_core,
} from '@/app/_core/resources_core'
import { ActionResult, ok, err, fromError } from './_result'

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
): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  return update_account_core(user_id, id, name, type, parent_id, is_active, is_placeholder, linked_user_id)
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
  // Authorize before any user-controlled ticker triggers an external price
  // fetch / NAV sync — those have side effects and must not be reachable by non-admins.
  try {
    await require_admin()
  } catch (error) {
    return fromError(error)
  }
  return create_asset_core(name, type, ticker, parent_id)
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
  try {
    await require_admin()
  } catch (error) {
    return fromError(error)
  }
  return update_asset_core(id, name, type, ticker, parent_id, is_active, is_placeholder)
}

export async function delete_asset(id: string): Promise<ActionResult> {
  try {
    await require_admin()
  } catch (error) {
    return fromError(error)
  }
  return delete_asset_core(id)
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

    // Verify all rows are siblings under the same parent. Accounts are
    // user-scoped; assets are global and admin-managed.
    if (scope === 'account') {
      const user_id = await get_current_user_id()
      if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
      const rows = await prisma.accounting_head.findMany({
        where: { id: { in: ordered_ids }, user_id, parent_id },
        select: { id: true },
      })
      if (rows.length !== ordered_ids.length) {
        return err('VALIDATION', 'One or more items are not siblings under this parent or do not belong to you')
      }
    } else {
      await require_admin()
      const rows = await prisma.asset.findMany({
        where: { id: { in: ordered_ids }, parent_id },
        select: { id: true },
      })
      if (rows.length !== ordered_ids.length) {
        return err('VALIDATION', 'One or more items are not siblings under this parent')
      }
    }

    // Reassign order_index sequentially. Wrap in a transaction so partial
    // failures don't leave the ordering inconsistent.
    await prisma.$transaction(
      ordered_ids.map((id, i) =>
        scope === 'account'
          ? prisma.accounting_head.update({ where: { id }, data: { order_index: i } })
          : prisma.asset.update({ where: { id }, data: { order_index: i } }),
      ),
    )
    return ok()
  } catch (error) {
    return fromError(error)
  }
}
