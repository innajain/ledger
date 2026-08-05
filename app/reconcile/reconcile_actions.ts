'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { reconcile_ledger_core } from '@/app/_core/reconcile_core'
import { create_transactions_core, type BulkTransactionInput } from '@/app/_core/transactions_core'
import { update_account_core } from '@/app/_core/resources_core'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import { asset_type } from '@/generated/prisma/enums'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'

export type StatementRow = {
  index: number
  date: string // yyyy-MM-dd
  amount: number // signed, negative = money out
  ref: string | null
  desc: string | null
}

export type ReconcileView = {
  account_id: string
  account_name: string
  counts: {
    bank_rows: number
    ledger_flows: number
    matched: number
    amount_mismatch: number
    missing_in_ledger: number
    missing_in_bank: number
  }
  matched: (StatementRow & { transaction_id: string; matched_by: 'ref' | 'amount_date' })[]
  amount_mismatch: (StatementRow & { transaction_id: string; ledger_delta: number })[]
  missing_in_ledger: StatementRow[]
  // one entry per unmatched ledger flow (account line item), not per transaction
  missing_in_bank: { transaction_id: string; datetime: string; delta: number; external_ref: string | null; description: string | null }[]
  ledger_closing_balance: number
}

function ist_day(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date "${date}"`)
  const [y, m, d] = date.split('-')
  return get_date_obj_from_indian_date(`${d}-${m}-${y}`)
}

async function owned_account(user_id: string, account_id: string) {
  return prisma.accounting_head.findFirst({ where: { id: account_id, user_id, type: 'account' }, select: { id: true, name: true } })
}

export async function run_reconcile(account_id: string, rows: StatementRow[]): Promise<ActionResult<ReconcileView>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (rows.length === 0) return err('VALIDATION', 'No statement rows to reconcile')
    if (rows.length > 1000) return err('VALIDATION', 'Too many rows (max 1000)')
    const account = await owned_account(user_id, account_id)
    if (!account) return err('NOT_FOUND', 'Account not found')

    const bank_rows = rows.map(r => ({ date: ist_day(r.date), amount: r.amount, ref: r.ref, desc: r.desc }))
    const { flows, result, flow_by_id, closing_balance } = await reconcile_ledger_core(user_id, account.id, bank_rows)
    const txn_of = (entry_id: string) => flow_by_id.get(entry_id)!.transaction_id

    return ok({
      account_id: account.id,
      account_name: account.name,
      counts: {
        bank_rows: rows.length,
        ledger_flows: flows.length,
        matched: result.matched.length,
        amount_mismatch: result.amount_mismatch.length,
        missing_in_ledger: result.missing_in_ledger.length,
        missing_in_bank: result.missing_in_bank.length,
      },
      matched: result.matched.map(m => ({ ...rows[m.row_index], transaction_id: txn_of(m.entry_id), matched_by: m.matched_by })),
      amount_mismatch: result.amount_mismatch.map(m => ({ ...rows[m.row_index], transaction_id: txn_of(m.entry_id), ledger_delta: m.ledger_delta })),
      missing_in_ledger: result.missing_in_ledger.map(i => rows[i]),
      missing_in_bank: result.missing_in_bank.map(id => {
        const f = flow_by_id.get(id)!
        return {
          transaction_id: f.transaction_id,
          datetime: f.datetime.toISOString(),
          delta: f.amount,
          external_ref: f.external_ref,
          description: f.description,
        }
      }),
      ledger_closing_balance: closing_balance,
    })
  } catch (error) {
    return fromError(error)
  }
}

// Create the selected missing statement rows as transactions on the account,
// balanced onto one allocation head + one income/expense head. Each row gets
// external_ref and a deterministic idempotency_key, so re-running an import
// can never double-post.
export async function create_missing_transactions(
  account_id: string,
  allocation_id: string,
  income_expense_id: string,
  rows: StatementRow[],
): Promise<ActionResult<{ created: number; replayed: number }>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (rows.length === 0) return err('VALIDATION', 'No rows selected')
    if (rows.length > 50) return err('VALIDATION', 'Create at most 50 transactions at a time')
    const account = await owned_account(user_id, account_id)
    if (!account) return err('NOT_FOUND', 'Account not found')

    const [alloc, ie, user_row, rupee_assets] = await Promise.all([
      prisma.accounting_head.findFirst({ where: { id: allocation_id, user_id, type: 'allocation' }, select: { id: true } }),
      prisma.accounting_head.findFirst({ where: { id: income_expense_id, user_id, type: 'income_expense' }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: user_id }, select: { default_asset_id: true } }),
      prisma.asset.findMany({
        where: { type: asset_type.rupees, is_active: true },
        select: { id: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
    ])
    if (!alloc) return err('NOT_FOUND', 'Allocation head not found')
    if (!ie) return err('NOT_FOUND', 'Income/expense head not found')
    if (rupee_assets.length === 0) return err('NOT_FOUND', 'You need a rupees asset to record statement entries')
    const rupee_asset_id = rupee_assets.find(a => a.id === user_row?.default_asset_id)?.id ?? rupee_assets[0].id

    const items: BulkTransactionInput[] = rows.map(r => ({
      datetime: ist_day(r.date),
      description: r.desc || (r.ref ? `Statement entry ${r.ref}` : 'Statement entry'),
      idempotency_key: r.ref ? `recon:${account.id}:${r.ref}` : `recon:${account.id}:${r.date}:${r.amount}:${r.index}`,
      line_items: [
        { accounting_head_id: account.id, asset_id: rupee_asset_id, quantity: r.amount, external_ref: r.ref },
        { accounting_head_id: alloc.id, asset_id: rupee_asset_id },
        { accounting_head_id: ie.id, asset_id: rupee_asset_id },
      ],
    }))

    const res = await create_transactions_core(user_id, items)
    if (!res.success) return res
    const replayed = res.data!.replayed_ids.length
    return ok({ created: res.data!.ids.length - replayed, replayed }, res.message)
  } catch (error) {
    return fromError(error)
  }
}

// Advance the account's reconciliation lock after a clean match — everything on
// or before this day is verified against the bank and becomes immutable.
export async function set_reconciliation_lock(account_id: string, date: string): Promise<ActionResult> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    const account = await owned_account(user_id, account_id)
    if (!account) return err('NOT_FOUND', 'Account not found')
    return await update_account_core(user_id, account.id, undefined, undefined, undefined, undefined, undefined, undefined, ist_day(date))
  } catch (error) {
    return fromError(error)
  }
}
