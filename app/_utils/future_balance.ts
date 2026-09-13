import { Prisma } from '@/generated/prisma/client'

export type FutureTxnInput = {
  id: string
  datetime: Date
  description: string | null
  // The transaction's normalized line items belonging to *one* head. Callers must pass
  // them pre-filtered to the head in question (normalization resolves null remainder
  // quantities first).
  line_items: { asset_id: string; quantity: Prisma.Decimal; txn_value: Prisma.Decimal }[]
}

export type FutureTxnRow = {
  id: string
  datetime: Date
  description: string | null
  // Net flow of this transaction on this head (sum of normalized txn_value over the
  // given line items) — the "amount" shown in the head page's future section.
  amount: number
  // null when the transaction has no line items on this head's balance (nothing to
  // check), or when it's overdue (datetime already in the past — see below).
  sufficient: boolean | null
  per_asset_delta: { asset_id: string; qty: number }[]
}

// Walks a head's future transactions once, carrying a running per-asset Decimal balance
// that starts as a copy of the current real balances. A transaction is `sufficient` when
// every asset it touches on this head stays >= 0 after applying its (cumulative) effect.
// A transaction dated before `now` is overdue rather than forward-looking: it neither
// earns a sufficiency verdict nor contributes to the running balance later transactions
// are checked against, so callers don't need to pre-filter it out themselves. Sort
// `future_txns` ascending by datetime — the walk relies on that order. Pure — no DB — so
// it's unit-testable in isolation.
export function compute_future_sufficiency(
  current_balances: Map<string, Prisma.Decimal>,
  future_txns: FutureTxnInput[],
  now: Date = new Date(),
): FutureTxnRow[] {
  const running = new Map(current_balances)
  const rows: FutureTxnRow[] = []
  for (const txn of future_txns) {
    const per_asset_delta: { asset_id: string; qty: number }[] = []
    let amount = new Prisma.Decimal(0)
    for (const li of txn.line_items) {
      amount = amount.add(li.txn_value)
      per_asset_delta.push({ asset_id: li.asset_id, qty: li.quantity.toNumber() })
    }

    let sufficient: boolean | null = null
    if (txn.datetime >= now) {
      for (const li of txn.line_items) running.set(li.asset_id, (running.get(li.asset_id) ?? new Prisma.Decimal(0)).add(li.quantity))
      const touched = txn.line_items.map(li => li.asset_id)
      sufficient = touched.length > 0 ? touched.every(aid => (running.get(aid) ?? new Prisma.Decimal(0)).gte(0)) : null
    }

    rows.push({
      id: txn.id,
      datetime: txn.datetime,
      description: txn.description,
      amount: amount.toDecimalPlaces(2).toNumber(),
      sufficient,
      per_asset_delta,
    })
  }
  return rows
}
