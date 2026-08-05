'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { prisma } from '@/lib/prisma'
import { closing_balance_core } from '@/app/_core/balances_core'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'

export type ClosingBalance = { rows: { asset_name: string; qty: number; value: number }[]; total_value: number }

// Closing balance of one head at the end of the given IST day (date is
// yyyy-MM-dd from an <input type="date">). Book values, not marked to market.
export async function get_closing_balance(head_id: string, date: string): Promise<ActionResult<ClosingBalance>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('VALIDATION', 'Invalid date')
    const head = await prisma.accounting_head.findUnique({ where: { id: head_id, user_id }, select: { id: true } })
    if (!head) return err('NOT_FOUND', 'Head not found')

    const [y, m, d] = date.split('-')
    const cutoff = get_date_obj_from_indian_date(`${d}-${m}-${y}`)
    cutoff.setDate(cutoff.getDate() + 1)

    const raw = await closing_balance_core(user_id, head_id, cutoff)
    const assets = raw.length
      ? await prisma.asset.findMany({ where: { id: { in: raw.map(r => r.asset_id) } }, select: { id: true, name: true } })
      : []
    const name_by_id = new Map(assets.map(a => [a.id, a.name]))
    const rows = raw.map(r => ({ asset_name: name_by_id.get(r.asset_id) ?? r.asset_id, qty: r.qty, value: r.value }))
    return ok({ rows, total_value: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100 })
  } catch (error) {
    return fromError(error)
  }
}
