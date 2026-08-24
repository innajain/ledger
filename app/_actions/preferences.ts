'use server'

import { get_current_user_id, get_current_user_row } from './auth'
import { ActionResult, err } from './_result'
import { revalidatePath } from 'next/cache'
import {
  DEFAULT_USER_PREFERENCES,
  update_own_upi_core,
  update_line_item_defaults_core,
  preferences_from_row,
  update_user_preferences_core,
} from '@/app/_core/preferences_core'
import type { LineItemDefaults, UserPreferences } from '@/app/_core/preferences_core'

export type { LineItemDefaults, ThemeChoice, UserPreferences } from '@/app/_core/preferences_core'

export async function update_own_upi(upi_id: string | null): Promise<ActionResult<{ upi_id: string | null }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  const res = await update_own_upi_core(user_id, upi_id)
  if (res.success) revalidatePath('/heads', 'layout')
  return res
}

export async function get_line_item_defaults(): Promise<LineItemDefaults> {
  const u = await get_current_user_row()
  if (!u) {
    return { default_account_id: null, default_allocation_id: null, default_income_expense_id: null, default_asset_id: null }
  }
  return {
    default_account_id: u.default_account_id,
    default_allocation_id: u.default_allocation_id,
    default_income_expense_id: u.default_income_expense_id,
    default_asset_id: u.default_asset_id,
  }
}

export async function update_line_item_defaults(input: LineItemDefaults): Promise<ActionResult<LineItemDefaults>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  const res = await update_line_item_defaults_core(user_id, input)
  if (res.success) {
    revalidatePath('/transactions/create')
    revalidatePath('/transactions')
    revalidatePath('/settings')
  }
  return res
}

export async function get_user_preferences(): Promise<UserPreferences> {
  const u = await get_current_user_row()
  if (!u) return DEFAULT_USER_PREFERENCES
  return preferences_from_row(u)
}

export async function update_user_preferences(input: Partial<UserPreferences>): Promise<ActionResult<UserPreferences>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  return update_user_preferences_core(user_id, input)
}
