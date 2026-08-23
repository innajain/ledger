import { describe, it, expect } from 'vitest'
import {
  month_to_date_window,
  previous_month_to_date_window,
  window_label,
  summarize_income_expense,
  pct_change,
  type SummaryLine,
} from './home_month_summary'
import { get_date_obj_from_indian_date } from './date'

const ist = (s: string) => get_date_obj_from_indian_date(s)
const ist_at = (s: string, hours: number) => new Date(ist(s).getTime() + hours * 3600 * 1000)

const line = (head_id: string, head_name: string, head_type: SummaryLine['head_type'], txn_value: number): SummaryLine => ({
  head_id,
  head_name,
  head_type,
  txn_value,
})

describe('month_to_date_window', () => {
  it('starts at IST midnight on the 1st and ends at the given instant', () => {
    const now = ist_at('23-08-2026', 14)
    const w = month_to_date_window(now)
    expect(w.from.getTime()).toBe(ist('01-08-2026').getTime())
    expect(w.to.getTime()).toBe(now.getTime())
  })

  it('uses the IST day, not UTC (late-evening IST is still the same IST month)', () => {
    // 31 Jul 2026 23:00 IST is 17:30 UTC — the IST month is July.
    const w = month_to_date_window(ist_at('31-07-2026', 23))
    expect(w.from.getTime()).toBe(ist('01-07-2026').getTime())
  })
})

describe('previous_month_to_date_window', () => {
  it('covers the same stretch of the previous month', () => {
    const w = previous_month_to_date_window(ist_at('23-08-2026', 14))
    expect(w.from.getTime()).toBe(ist('01-07-2026').getTime())
    expect(w.to.getTime()).toBe(ist_at('23-07-2026', 14).getTime())
  })

  it('clamps the day when the previous month is shorter', () => {
    const w = previous_month_to_date_window(ist_at('31-03-2026', 9))
    expect(w.from.getTime()).toBe(ist('01-02-2026').getTime())
    expect(w.to.getTime()).toBe(ist_at('28-02-2026', 9).getTime())
  })

  it('rolls back across the year boundary', () => {
    const w = previous_month_to_date_window(ist_at('05-01-2026', 0))
    expect(w.from.getTime()).toBe(ist('01-12-2025').getTime())
    expect(w.to.getTime()).toBe(ist('05-12-2025').getTime())
  })
})

describe('window_label', () => {
  it('labels the inclusive IST day span', () => {
    expect(window_label(month_to_date_window(ist_at('23-08-2026', 14)))).toBe('1–23 Aug')
    expect(window_label(previous_month_to_date_window(ist_at('23-08-2026', 14)))).toBe('1–23 Jul')
  })

  it('excludes the current day when no time has elapsed in it', () => {
    expect(window_label(month_to_date_window(ist('23-08-2026')))).toBe('1–22 Aug')
  })
})

describe('summarize_income_expense', () => {
  it('nets income_expense heads into spend and income (spend is reported positive)', () => {
    const summary = summarize_income_expense([
      line('e', 'Expenses', 'income_expense', -35),
      line('e', 'Expenses', 'income_expense', -165),
      line('s', 'Salary', 'income_expense', 50000),
      line('c', 'Cashbacks', 'income_expense', 20),
    ])
    expect(summary.spend).toBe(200)
    expect(summary.income).toBe(50020)
  })

  it('nets a refund against the head it was booked to', () => {
    const summary = summarize_income_expense([line('e', 'Expenses', 'income_expense', -500), line('e', 'Expenses', 'income_expense', 200)])
    expect(summary.spend).toBe(300)
    expect(summary.income).toBe(0)
  })

  it('ignores account lines entirely', () => {
    const summary = summarize_income_expense([line('k', 'Kotak', 'account', -35), line('e', 'Expenses', 'income_expense', -35)])
    expect(summary.spend).toBe(35)
    expect(summary.income).toBe(0)
  })

  it('ranks spend categories from allocation heads, biggest first', () => {
    const summary = summarize_income_expense(
      [
        line('food', 'Food', 'allocation', -300),
        line('food', 'Food', 'allocation', -200),
        line('rent', 'Rent', 'allocation', -20000),
        line('unalloc', 'Unallocated', 'allocation', 50000),
        line('inv', 'Investments', 'allocation', -5000),
        line('inv', 'Investments', 'allocation', 5000),
      ],
      2,
    )
    expect(summary.categories).toEqual([
      { head_id: 'rent', head_name: 'Rent', amount: 20000 },
      { head_id: 'food', head_name: 'Food', amount: 500 },
    ])
  })

  it('returns zeroes for an empty month', () => {
    expect(summarize_income_expense([])).toEqual({ spend: 0, income: 0, categories: [] })
  })
})

describe('pct_change', () => {
  it('computes a signed fraction', () => {
    expect(pct_change(150, 100)).toBeCloseTo(0.5)
    expect(pct_change(50, 100)).toBeCloseTo(-0.5)
  })

  it('has no answer when the previous period was zero', () => {
    expect(pct_change(150, 0)).toBeNull()
  })
})
