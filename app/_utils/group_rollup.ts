/**
 * What a transaction group's membership adds up to.
 *
 * A group is a label, not an account — it holds whole transactions, so its
 * "total" is the same signed book flow the transactions list shows per row
 * (the net over the transaction's account-type lines): positive = money in,
 * negative = money out, ~0 = a transfer.
 *
 * Future (scheduled) members are counted but never added up. They affect no
 * balance anywhere else in the ledger, so folding them into a group's spend
 * would make one number in the app disagree with all the others — they get
 * their own count instead, and the group page shows them separately.
 *
 * The /groups list computes this same shape in SQL (see `group_rollup_sql` in
 * `app/_core/groups_core.ts`) rather than pulling every grouped transaction's
 * line items into JS. That query's FILTER clauses mirror this function clause
 * for clause; this is the definition, and the tests below pin it.
 */
export type GroupFlowRow = { net: number; is_future: boolean }

export type GroupFlow = {
  /** Real (non-future) members. */
  count: number
  /** Scheduled members, excluded from every figure below. */
  future_count: number
  /** Sum of the positive nets (money in). */
  inflow: number
  /** Sum of the negative nets, as a positive number (money out). */
  outflow: number
  /** inflow − outflow. */
  net: number
}

/** Paise precision, matching the ledger's Decimal(14,4) columns rounded for display. */
const round2 = (n: number) => Math.round(n * 100) / 100

export function summarize_group_flow(rows: GroupFlowRow[]): GroupFlow {
  let count = 0
  let future_count = 0
  let inflow = 0
  let outflow = 0
  for (const row of rows) {
    if (row.is_future) {
      future_count++
      continue
    }
    count++
    if (row.net > 0) inflow += row.net
    else outflow -= row.net
  }
  return { count, future_count, inflow: round2(inflow), outflow: round2(outflow), net: round2(inflow - outflow) }
}
