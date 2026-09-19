'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { prisma } from '@/lib/prisma'
import { closing_balance_core } from '@/app/_core/balances_core'
import { load_subtree_head_ids } from '@/app/_utils/subtree_value'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'

export type ClosingBalance = { rows: { asset_name: string; qty: number; value: number }[]; total_value: number }

// Closing balance of one head at the end of the given IST day (date is
// yyyy-MM-dd from an <input type="date">). Book values, not marked to market.
// include_subheads widens it to the head's whole subtree, matching the head page's
// "including sub-heads" view. The subtree is resolved here from the caller's own heads —
// the client sends a flag, never a list of ids, so this stays scoped to the caller.
export async function get_closing_balance(head_id: string, date: string, include_subheads = false): Promise<ActionResult<ClosingBalance>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('VALIDATION', 'Invalid date')
    const head = await prisma.accounting_head.findUnique({ where: { id: head_id, user_id }, select: { id: true } })
    if (!head) return err('NOT_FOUND', 'Head not found')

    const [y, m, d] = date.split('-')
    const cutoff = get_date_obj_from_indian_date(`${d}-${m}-${y}`)
    cutoff.setDate(cutoff.getDate() + 1)

    const scope = include_subheads ? [...(await load_subtree_head_ids(head_id, user_id))] : head_id
    const raw = await closing_balance_core(user_id, scope, cutoff)
    const assets = raw.length
      ? await prisma.asset.findMany({ where: { id: { in: raw.map(r => r.asset_id) } }, select: { id: true, name: true } })
      : []
    const name_by_id = new Map(assets.map(a => [a.id, a.name]))
    // closing_balance_core returns one row per head/asset pair, so a subtree scope hands
    // back the same asset once per sub-head — fold them into one row per asset, which is
    // both what the card renders and what keeps its React keys unique.
    const by_asset = new Map<string, { asset_name: string; qty: number; value: number }>()
    for (const r of raw) {
      const e = by_asset.get(r.asset_id) ?? { asset_name: name_by_id.get(r.asset_id) ?? r.asset_id, qty: 0, value: 0 }
      e.qty += r.qty
      e.value += r.value
      by_asset.set(r.asset_id, e)
    }
    const rows = [...by_asset.values()].map(e => ({ ...e, qty: Math.round(e.qty * 10000) / 10000, value: Math.round(e.value * 100) / 100 }))
    return ok({ rows, total_value: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100 })
  } catch (error) {
    return reportActionError(error, { action: 'balance.close' })
  }
}
