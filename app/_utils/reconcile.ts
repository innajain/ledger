// Pure matching logic for reconciling bank-statement rows against ledger
// entries on one account head. Entries are whatever granularity the caller
// feeds in — the core feeds individual account line items (the atomic flows).
// Matching is one-to-one: pass 1 pairs by external reference (with the amount
// check selecting among entries that share a ref), pass 2 pairs the rest by
// amount + nearest date.

export type BankRow = { date: Date; amount: number; ref?: string | null; desc?: string | null }

export type LedgerEntry = { id: string; datetime: Date; delta: number; external_ref: string | null; description: string | null }

export type ReconcileMatch = { row_index: number; entry_id: string; matched_by: 'ref' | 'amount_date' }

export type ReconcileResult = {
  matched: ReconcileMatch[]
  // ref matched but the amounts disagree — needs human attention, counted in neither matched nor missing
  amount_mismatch: { row_index: number; entry_id: string; row_amount: number; ledger_delta: number }[]
  missing_in_ledger: number[]
  missing_in_bank: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export function match_bank_rows(
  rows: BankRow[],
  ledger: LedgerEntry[],
  opts?: { amount_tolerance?: number; date_tolerance_days?: number },
): ReconcileResult {
  const tol = opts?.amount_tolerance ?? 0.01
  // Bank rows carry day precision while ledger datetimes are intraday, so
  // "± N days" means a gap of up to N+1 calendar days' worth of milliseconds.
  const window_ms = ((opts?.date_tolerance_days ?? 1) + 1) * DAY_MS

  const matched: ReconcileMatch[] = []
  const amount_mismatch: ReconcileResult['amount_mismatch'] = []
  const row_done = new Set<number>()
  const ledger_done = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const ref = rows[i].ref?.trim()
    if (!ref) continue
    const candidates = ledger.filter(e => !ledger_done.has(e.id) && e.external_ref !== null && e.external_ref === ref)
    if (candidates.length === 0) continue
    const exact = candidates.find(e => Math.abs(e.delta - rows[i].amount) <= tol)
    if (exact) {
      matched.push({ row_index: i, entry_id: exact.id, matched_by: 'ref' })
      row_done.add(i)
      ledger_done.add(exact.id)
    } else {
      amount_mismatch.push({ row_index: i, entry_id: candidates[0].id, row_amount: rows[i].amount, ledger_delta: candidates[0].delta })
      row_done.add(i)
      ledger_done.add(candidates[0].id)
    }
  }

  for (let i = 0; i < rows.length; i++) {
    if (row_done.has(i)) continue
    const row = rows[i]
    let best: LedgerEntry | null = null
    let best_gap = Infinity
    for (const e of ledger) {
      if (ledger_done.has(e.id)) continue
      if (Math.abs(e.delta - row.amount) > tol) continue
      const gap = Math.abs(e.datetime.getTime() - row.date.getTime())
      if (gap >= window_ms || gap >= best_gap) continue
      best = e
      best_gap = gap
    }
    if (best) {
      matched.push({ row_index: i, entry_id: best.id, matched_by: 'amount_date' })
      row_done.add(i)
      ledger_done.add(best.id)
    }
  }

  return {
    matched,
    amount_mismatch,
    missing_in_ledger: rows.map((_, i) => i).filter(i => !row_done.has(i)),
    missing_in_bank: ledger.filter(e => !ledger_done.has(e.id)).map(e => e.id),
  }
}
