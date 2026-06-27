'use server'

import { get_current_user_id } from './auth'
import { ActionResult, err } from './_result'
import { revalidatePath } from 'next/cache'
import {
  DEFAULT_USER_PREFERENCES,
  update_own_upi_core,
  get_line_item_defaults_core,
  update_line_item_defaults_core,
  get_user_preferences_core,
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
  const user_id = await get_current_user_id()
  if (!user_id) {
    return { default_account_id: null, default_allocation_id: null, default_income_expense_id: null, default_asset_id: null }
  }
  return get_line_item_defaults_core(user_id)
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
  const user_id = await get_current_user_id()
  if (!user_id) return DEFAULT_USER_PREFERENCES
  return get_user_preferences_core(user_id)
}

export async function update_user_preferences(input: Partial<UserPreferences>): Promise<ActionResult<UserPreferences>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'Not authenticated')
  return update_user_preferences_core(user_id, input)
}
