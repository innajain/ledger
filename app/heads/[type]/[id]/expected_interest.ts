'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { prisma } from '@/lib/prisma'
import { expected_interest_core, type ExpectedInterest } from '@/app/_core/interest_core'
import { load_subtree_head_ids } from '@/app/_utils/subtree_value'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'

// Savings interest a bank would pay on one account over the inclusive IST days
// [from, to] (yyyy-MM-dd, from <input type="date">) at rate_pct a year — the figure to
// hold against the interest actually credited. include_subheads follows the head page's
// scope toggle; the subtree is resolved here from the caller's own heads, so the client
// sends a flag and never a list of ids.
export async function get_expected_interest(
  head_id: string,
  from: string,
  to: string,
  rate_pct: number,
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
    return ok(await expected_interest_core(user_id, scope, from, to, rate_pct))
  } catch (error) {
    return reportActionError(error, { action: 'interest.expected' })
  }
}
