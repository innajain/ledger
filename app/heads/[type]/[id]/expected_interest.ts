'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { prisma } from '@/lib/prisma'
import { expected_interest_core, save_interest_settings_core, type ExpectedInterest } from '@/app/_core/interest_core'
import { load_subtree_head_ids } from '@/app/_utils/subtree_value'
import type { InterestConfig, InterestSettings } from '@/app/_utils/interest_config'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

// Savings interest a bank would pay on one account over the inclusive IST days
// [from, to] (yyyy-MM-dd, from <input type="date">) on the given rate card — the figure to
// hold against the interest actually credited. `config` arrives from the browser, so the
// core validates it. include_subheads follows the head page's scope toggle; the subtree is
// resolved here from the caller's own heads, so the client sends a flag and never a list
// of ids.
export async function get_expected_interest(
  head_id: string,
  from: string,
  to: string,
  config: InterestConfig,
  include_subheads = false,
): Promise<ActionResult<ExpectedInterest>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (typeof head_id !== 'string' || typeof from !== 'string' || typeof to !== 'string') return err('VALIDATION', 'Invalid period')
    const head = await prisma.accounting_head.findUnique({ where: { id: head_id, user_id }, select: { id: true, type: true } })
    if (!head) return err('NOT_FOUND', 'Head not found')
    // Interest is paid on money held somewhere; an allocation or an income head is a
    // label over that money, not a balance a bank pays on.
    if (head.type !== 'account') return err('VALIDATION', 'Interest is worked out for accounts only')

    const scope = include_subheads ? [...(await load_subtree_head_ids(head_id, user_id))] : [head_id]
    return ok(await expected_interest_core(user_id, scope, from, to, config))
  } catch (error) {
    return reportActionError(error, { action: 'interest.expected' })
  }
}

// Saves an account's rate card so the card and the MCP tool need only dates from then on,
// on every device — or clears it with null. `settings` comes from the browser, so the core
// validates it and checks the account is the caller's.
export async function save_interest_settings(head_id: string, settings: InterestSettings | null): Promise<ActionResult<InterestSettings | null>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (typeof head_id !== 'string') return err('VALIDATION', 'Invalid account')
    const saved = await save_interest_settings_core(user_id, head_id, settings)
    audit(saved ? 'interest_settings.save' : 'interest_settings.clear', user_id, { surface: 'web' })
    return ok(saved)
  } catch (error) {
    return reportActionError(error, { action: 'interest.settings.save' })
  }
}
