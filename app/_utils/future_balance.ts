import { Prisma } from '@/generated/prisma/client'

export type FutureLineItemInput = {
  id: string
  transaction_id: string
  // Effective date for ordering/overdue purposes — the line's own datetime override if
  // set, else its transaction's datetime (same rule the rest of the app uses).
  datetime: Date
  description: string | null
  asset_id: string
  quantity: Prisma.Decimal
  txn_value: Prisma.Decimal
}

export type FutureLineItemRow = {
  id: string
  transaction_id: string
  datetime: Date
  description: string | null
  asset_id: string
  amount: number
  // null when this line item is overdue (its datetime already in the past) — it neither
  // earns a verdict nor updates the running balance (see below).
  sufficient: boolean | null
  balance_after: number | null
}

// Walks a head's future line items once (one row per line item, not per transaction — a
// transaction with two lines on this head, e.g. rent + brokerage against the same
// account, produces two rows), carrying a running per-asset Decimal balance that starts
// as a copy of the current real balances. A line item is `sufficient` when its asset
// stays >= 0 immediately after it lands. A line item dated before `now` is overdue
// rather than forward-looking: it neither earns a verdict nor updates the running
// balance later line items are checked against, so callers don't need to pre-filter it
// out themselves. Sort `line_items` ascending by (effective) datetime — the walk relies
// on that order. Pure — no DB — so it's unit-testable in isolation.
export function compute_future_sufficiency(
  current_balances: Map<string, Prisma.Decimal>,
  line_items: FutureLineItemInput[],
  now: Date = new Date(),
): FutureLineItemRow[] {
  const running = new Map(current_balances)
  const rows: FutureLineItemRow[] = []
  for (const li of line_items) {
    const is_overdue = li.datetime < now
    let sufficient: boolean | null = null
    let balance_after: number | null = null
    if (!is_overdue) {
      const updated = (running.get(li.asset_id) ?? new Prisma.Decimal(0)).add(li.quantity)
      running.set(li.asset_id, updated)
      balance_after = updated.toNumber()
      sufficient = updated.gte(0)
    }
    rows.push({
      id: li.id,
      transaction_id: li.transaction_id,
      datetime: li.datetime,
      description: li.description,
      asset_id: li.asset_id,
      amount: li.txn_value.toDecimalPlaces(2).toNumber(),
      sufficient,
      balance_after,
    })
  }
  return rows
}
