import { prisma } from '@/lib/prisma'
import { match_bank_rows, type BankRow, type ReconcileResult } from '@/app/_utils/reconcile'
import { closing_balance_core } from '@/app/_core/balances_core'

const DAY_MS = 24 * 60 * 60 * 1000

// One matchable ledger flow: a single account-head line item. Line items are
// the atomic money movements — a transaction is just the balanced grouping —
// so a bank-statement row corresponds to a line, not to a whole transaction.
export type LedgerFlow = {
  line_item_id: string
  transaction_id: string
  datetime: Date
  amount: number
  // the line's own bank ref — line items are the actual bank rows
  external_ref: string | null
  description: string | null
}

export type ReconcileLedgerOutput = {
  from: Date
  to_exclusive: Date
  flows: LedgerFlow[]
  result: ReconcileResult
  // maps matcher entry ids (line item ids) back to rich flow info
  flow_by_id: Map<string, LedgerFlow>
  // signed book value on the head across ALL time strictly before to_exclusive
  closing_balance: number
}

// Reconcile bank-statement rows against one account head's individual line
// items. Account lines always carry explicit quantity (and txn_value for
// non-rupee assets), so raw values are exact — no normalization needed. Each
// line's effective date is li.datetime ?? txn.datetime, honoring per-line
// overrides. Shared by the MCP `reconcile` tool and the /reconcile page.
export async function reconcile_ledger_core(
  user_id: string,
  head_id: string,
  rows: BankRow[],
  window?: { from?: Date; to_exclusive?: Date },
): Promise<ReconcileLedgerOutput> {
  const from = window?.from ?? new Date(Math.min(...rows.map(r => r.date.getTime())) - 2 * DAY_MS)
  const to_exclusive = window?.to_exclusive ?? new Date(Math.max(...rows.map(r => r.date.getTime())) + 3 * DAY_MS)

  // Query on the transaction datetime with padding so per-line datetime
  // overrides near the window edges are still seen, then filter each line by
  // its effective date.
  const line_items = await prisma.line_item.findMany({
    where: {
      accounting_head_id: head_id,
      transaction: { user_id, datetime: { gte: new Date(from.getTime() - 7 * DAY_MS), lt: new Date(to_exclusive.getTime() + 7 * DAY_MS) } },
    },
    include: { transaction: { select: { id: true, datetime: true, description: true } } },
  })

  const flows: LedgerFlow[] = line_items
    .map(li => {
      const datetime = li.datetime ?? li.transaction.datetime
      const amount = li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0
      return {
        line_item_id: li.id,
        transaction_id: li.transaction.id,
        datetime,
        amount: Math.round(amount * 100) / 100,
        external_ref: li.external_ref,
        description: li.description ?? li.transaction.description,
      }
    })
    .filter(f => f.datetime >= from && f.datetime < to_exclusive)
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime())

  const result = match_bank_rows(
    rows,
    flows.map(f => ({ id: f.line_item_id, datetime: f.datetime, delta: f.amount, external_ref: f.external_ref, description: f.description })),
  )
  const flow_by_id = new Map(flows.map(f => [f.line_item_id, f]))

  const closing_rows = await closing_balance_core(user_id, head_id, to_exclusive)
  const closing_balance = Math.round(closing_rows.reduce((s, r) => s + r.value, 0) * 100) / 100

  return { from, to_exclusive, flows, result, flow_by_id, closing_balance }
}
