import { Prisma } from '@/generated/prisma/client'
import { day_number, inclusive_days } from '@/app/_utils/interest_periods'

// How Indian banks pay savings interest: each day's CLOSING balance earns rate/365, the
// days of the period are summed, and the total is rounded to the nearest rupee when it is
// credited (quarterly, for most banks). Checked against a year of Kotak statements — the
// three quarters reproduce to the rupee on value-date balances.
//
// 365 is fixed, leap year or not: that is the divisor the banks publish, and 29 Feb is
// simply one more day that earns.
export const INTEREST_DAY_BASIS = 365

// A movement on a calendar day (yyyy-MM-dd, IST). Time of day is irrelevant — only where
// the balance stands when the day closes.
export type DailyMovement = { day: string; amount: Prisma.Decimal }

export type DailyBalanceInterest = {
  days: number
  // Mean of the interest-EARNING balance, so average × rate × days/365 is the interest.
  // It differs from the plain mean only when a day closed below zero.
  average_balance: Prisma.Decimal
  lowest_balance: Prisma.Decimal
  highest_balance: Prisma.Decimal
  // Days that closed below zero. They earn nothing (a bank does not pay you on an
  // overdraft) and are counted so the caller can say the figure was clamped.
  negative_days: number
  interest: Prisma.Decimal
  interest_rounded: Prisma.Decimal
}

// Movements dated before `from` are part of the opening balance and ones after `to` are
// ignored, so a caller can hand over an account's whole history with opening_balance 0
// rather than splitting it at the boundary itself.
export function compute_daily_balance_interest(input: {
  opening_balance: Prisma.Decimal
  movements: DailyMovement[]
  from: string
  to: string
  annual_rate_pct: Prisma.Decimal
}): DailyBalanceInterest {
  const first = day_number(input.from)
  const days = inclusive_days(input.from, input.to)
  const last = first + days - 1

  let balance = input.opening_balance
  const by_day = new Map<number, Prisma.Decimal>()
  for (const mv of input.movements) {
    const n = day_number(mv.day)
    if (n > last) continue
    if (n < first) balance = balance.plus(mv.amount)
    else by_day.set(n, (by_day.get(n) ?? new Prisma.Decimal(0)).plus(mv.amount))
  }

  const zero = new Prisma.Decimal(0)
  let earning_sum = zero
  let lowest: Prisma.Decimal | null = null
  let highest: Prisma.Decimal | null = null
  let negative_days = 0
  for (let n = first; n <= last; n++) {
    const moved = by_day.get(n)
    if (moved) balance = balance.plus(moved)
    if (balance.isNegative() && !balance.isZero()) negative_days++
    else earning_sum = earning_sum.plus(balance)
    if (lowest === null || balance.lessThan(lowest)) lowest = balance
    if (highest === null || balance.greaterThan(highest)) highest = balance
  }

  const interest = earning_sum.times(input.annual_rate_pct).dividedBy(100).dividedBy(INTEREST_DAY_BASIS)
  return {
    days,
    average_balance: earning_sum.dividedBy(days),
    lowest_balance: lowest ?? zero,
    highest_balance: highest ?? zero,
    negative_days,
    interest,
    interest_rounded: interest.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
  }
}
