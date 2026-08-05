import { prisma } from '@/lib/prisma'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { match_bank_rows, type BankRow, type LedgerEntry, type ReconcileResult } from '@/app/_utils/reconcile'
import { closing_balance_core } from '@/app/_core/balances_core'

const DAY_MS = 24 * 60 * 60 * 1000

export type ReconcileLedgerOutput = {
  from: Date
  to_exclusive: Date
  ledger: LedgerEntry[]
  result: ReconcileResult
  // signed book value on the head across ALL time strictly before to_exclusive
  closing_balance: number
}

// Reconcile bank-statement rows against one head: fetch the ledger window,
// compute each transaction's signed delta on the head (from normalized lines),
// match one-to-one via match_bank_rows, and report the closing balance at the
// window end. Shared by the MCP `reconcile` tool and the /reconcile page.
export async function reconcile_ledger_core(
  user_id: string,
  head_id: string,
  rows: BankRow[],
  window?: { from?: Date; to_exclusive?: Date },
): Promise<ReconcileLedgerOutput> {
  const from = window?.from ?? new Date(Math.min(...rows.map(r => r.date.getTime())) - 2 * DAY_MS)
  const to_exclusive = window?.to_exclusive ?? new Date(Math.max(...rows.map(r => r.date.getTime())) + 3 * DAY_MS)

  const txns = await prisma.transaction.findMany({
    where: { user_id, datetime: { gte: from, lt: to_exclusive }, line_items: { some: { accounting_head_id: head_id } } },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
    orderBy: { datetime: 'asc' },
  })
  const ledger: LedgerEntry[] = txns.map(raw => {
    const t = normalize_txn(raw)
    const delta = t.line_items.filter(li => li.accounting_head_id === head_id).reduce((s, li) => s + li.txn_value.toNumber(), 0)
    return { id: t.id, datetime: t.datetime, delta: Math.round(delta * 100) / 100, external_ref: t.external_ref, description: t.description }
  })

  const result = match_bank_rows(rows, ledger)
  const closing_rows = await closing_balance_core(user_id, head_id, to_exclusive)
  const closing_balance = Math.round(closing_rows.reduce((s, r) => s + r.value, 0) * 100) / 100

  return { from, to_exclusive, ledger, result, closing_balance }
}
