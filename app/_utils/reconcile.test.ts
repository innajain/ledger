import { describe, it, expect } from 'vitest'
import { match_bank_rows, type BankRow, type LedgerEntry } from './reconcile'

const day = (d: string) => new Date(`${d}T00:00:00+05:30`)
const at = (d: string, t: string) => new Date(`${d}T${t}+05:30`)

const entry = (id: string, datetime: Date, delta: number, external_ref: string | null = null): LedgerEntry => ({
  id,
  datetime,
  delta,
  external_ref,
  description: null,
})

describe('match_bank_rows', () => {
  it('matches by external ref first, regardless of date distance', () => {
    const rows: BankRow[] = [{ date: day('2026-07-01'), amount: -500, ref: 'UPI-111' }]
    const ledger = [entry('t1', at('2026-07-20', '10:00:00'), -500, 'UPI-111')]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([{ row_index: 0, entry_id: 't1', matched_by: 'ref' }])
    expect(res.missing_in_ledger).toEqual([])
    expect(res.missing_in_bank).toEqual([])
  })

  it('flags ref matches whose amounts disagree instead of matching or dropping them', () => {
    const rows: BankRow[] = [{ date: day('2026-07-01'), amount: -500, ref: 'UPI-111' }]
    const ledger = [entry('t1', day('2026-07-01'), -650, 'UPI-111')]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([])
    expect(res.amount_mismatch).toEqual([{ row_index: 0, entry_id: 't1', row_amount: -500, ledger_delta: -650 }])
    expect(res.missing_in_ledger).toEqual([])
    expect(res.missing_in_bank).toEqual([])
  })

  it('resolves several entries sharing one ref (lines of one transaction) by amount', () => {
    const rows: BankRow[] = [
      { date: day('2026-07-31'), amount: 9443.22, ref: 'UPI-777' },
      { date: day('2026-07-31'), amount: -8493, ref: 'UPI-777' },
    ]
    const ledger = [entry('line-in', day('2026-07-31'), 9443.22, 'UPI-777'), entry('line-out', day('2026-07-31'), -8493, 'UPI-777')]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([
      { row_index: 0, entry_id: 'line-in', matched_by: 'ref' },
      { row_index: 1, entry_id: 'line-out', matched_by: 'ref' },
    ])
    expect(res.missing_in_ledger).toEqual([])
    expect(res.missing_in_bank).toEqual([])
  })

  it('matches by amount within ±1 day when no ref is available', () => {
    const rows: BankRow[] = [{ date: day('2026-07-10'), amount: -1840 }]
    const ledger = [entry('t1', at('2026-07-11', '22:15:00'), -1840)]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([{ row_index: 0, entry_id: 't1', matched_by: 'amount_date' }])
  })

  it('does not match by amount outside the date window', () => {
    const rows: BankRow[] = [{ date: day('2026-07-10'), amount: -1840 }]
    const ledger = [entry('t1', day('2026-07-15'), -1840)]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([])
    expect(res.missing_in_ledger).toEqual([0])
    expect(res.missing_in_bank).toEqual(['t1'])
  })

  it('prefers the nearest-dated candidate and keeps matching one-to-one', () => {
    const rows: BankRow[] = [
      { date: day('2026-07-10'), amount: -100 },
      { date: day('2026-07-11'), amount: -100 },
    ]
    const ledger = [entry('near', at('2026-07-10', '09:00:00'), -100), entry('far', at('2026-07-11', '21:00:00'), -100)]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([
      { row_index: 0, entry_id: 'near', matched_by: 'amount_date' },
      { row_index: 1, entry_id: 'far', matched_by: 'amount_date' },
    ])
  })

  it('reports both sides of a fully unmatched reconciliation', () => {
    const rows: BankRow[] = [{ date: day('2026-07-10'), amount: -75, ref: 'UPI-999' }]
    const ledger = [entry('t1', day('2026-07-10'), -6800)]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toEqual([])
    expect(res.missing_in_ledger).toEqual([0])
    expect(res.missing_in_bank).toEqual(['t1'])
  })

  it('tolerates sub-paisa rounding differences on amounts', () => {
    const rows: BankRow[] = [{ date: day('2026-07-10'), amount: -100.004 }]
    const ledger = [entry('t1', day('2026-07-10'), -100)]
    const res = match_bank_rows(rows, ledger)
    expect(res.matched).toHaveLength(1)
  })
})
