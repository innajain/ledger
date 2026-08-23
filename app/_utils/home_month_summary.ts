import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'

// Month-to-date income/expense rollup for the home dashboard.
//
// Totals come from income_expense head nets — the only correct way to total a period
// (gross account flows also carry transfers, card payments, EMIs and investments, which
// are neither income nor spend). Ledger convention: money out is negative, money in
// positive, so a head whose net is negative is spending.
//
// The category breakdown is taken from the *allocation* heads of the same transactions:
// income_expense heads in this ledger are coarse ("Expenses"), while the human-readable
// buckets a person thinks of as categories (Food, Rent, Commute…) are allocation heads.
// Allocation lines of a pure transfer net to zero, and an investment purchase nets to zero
// across its two asset legs, so only real spending shows up as a negative allocation net.

export type DateWindow = { from: Date; to: Date }

export type SummaryLine = {
  head_id: string
  head_name: string
  head_type: 'account' | 'allocation' | 'income_expense'
  txn_value: number
}

export type SpendCategory = { head_id: string; head_name: string; amount: number }

export type MonthSummary = {
  spend: number
  income: number
  categories: SpendCategory[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

function ist_parts(date: Date): { y: number; m: number; d: number } {
  const [y, m, d] = formatInTimeZone(date, USER_TIMEZONE, 'yyyy-MM-dd').split('-').map(Number)
  return { y, m, d }
}

function ist_midnight(y: number, m: number, d: number): Date {
  return fromZonedTime(`${pad(y, 4)}-${pad(m)}-${pad(d)}T00:00:00`, USER_TIMEZONE)
}

function days_in_month(y: number, m: number): number {
  // Day 0 of the next month is the last day of this one; UTC keeps it timezone-safe.
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** [first IST midnight of this month, now) */
export function month_to_date_window(now: Date): DateWindow {
  const { y, m } = ist_parts(now)
  return { from: ist_midnight(y, m, 1), to: now }
}

/**
 * The same stretch of the previous month: 1st through the same day-of-month at the same
 * time of day (clamped when the previous month is shorter — 31 Mar compares against 28 Feb).
 */
export function previous_month_to_date_window(now: Date): DateWindow {
  const { y, m, d } = ist_parts(now)
  const elapsed = now.getTime() - ist_midnight(y, m, d).getTime()
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  const pd = Math.min(d, days_in_month(py, pm))
  return { from: ist_midnight(py, pm, 1), to: new Date(ist_midnight(py, pm, pd).getTime() + elapsed) }
}

/** "1–23 Aug" — the window's inclusive last IST day. */
export function window_label(window: DateWindow): string {
  const last = new Date(Math.max(window.to.getTime() - 1, window.from.getTime()))
  return `${formatInTimeZone(window.from, USER_TIMEZONE, 'd')}–${formatInTimeZone(last, USER_TIMEZONE, 'd MMM')}`
}

export function summarize_income_expense(lines: SummaryLine[], category_limit = 4): MonthSummary {
  const income_expense_nets = new Map<string, number>()
  const allocation_nets = new Map<string, { name: string; net: number }>()

  for (const line of lines) {
    if (line.head_type === 'income_expense') {
      income_expense_nets.set(line.head_id, (income_expense_nets.get(line.head_id) ?? 0) + line.txn_value)
    } else if (line.head_type === 'allocation') {
      const existing = allocation_nets.get(line.head_id)
      allocation_nets.set(line.head_id, { name: line.head_name, net: (existing?.net ?? 0) + line.txn_value })
    }
  }

  let spend = 0
  let income = 0
  for (const net of income_expense_nets.values()) {
    if (net < 0) spend += -net
    else income += net
  }

  const categories = [...allocation_nets]
    .filter(([, v]) => v.net < 0)
    .map(([head_id, v]) => ({ head_id, head_name: v.name, amount: round2(-v.net) }))
    .filter(c => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, category_limit)

  return { spend: round2(spend), income: round2(income), categories }
}

/** Fractional change vs the comparison period; null when there is nothing to compare against. */
export function pct_change(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / Math.abs(previous)
}
