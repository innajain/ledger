import { Prisma } from '@/generated/prisma/client'
import { day_number, days_in_year_basis, inclusive_days } from '@/app/_utils/interest_periods'
import type { InterestConfig } from '@/app/_utils/interest_config'

// How Indian banks pay savings interest: each day's CLOSING balance earns rate ÷ days in
// the year, the days of the period are summed, and the total is rounded when it is credited
// (quarterly or monthly for most banks, daily for a few). Checked against a year of Kotak
// statements — the three quarters reproduce to the rupee on value-date balances at a flat
// 2.5%, nearest rupee, 365-day year, which is the default config.
//
// The config covers how banks differ: a progressive rate card (each band's rate applies to
// the part of the balance inside it), what a year is (365 flat, calendar year or financial
// year), and how the credit is rounded (nearest rupee, up, or to the paisa; each day to
// the paisa first for a bank that credits daily).

// A movement on a calendar day (yyyy-MM-dd, IST). Time of day is irrelevant — only where
// the balance stands when the day closes.
export type DailyMovement = { day: string; amount: Prisma.Decimal }

export type SlabInterest = { up_to: number | null; rate_pct: number; interest: Prisma.Decimal }

export type DailyBalanceInterest = {
  days: number
  // Mean of the interest-EARNING balance. It differs from the plain mean only when a day
  // closed below zero.
  average_balance: Prisma.Decimal
  lowest_balance: Prisma.Decimal
  highest_balance: Prisma.Decimal
  // Days that closed below zero. They earn nothing (a bank does not pay you on an
  // overdraft) and are counted so the caller can say the figure was clamped.
  negative_days: number
  // The interest the period earned: exact, or the sum of each day's paisa when the config
  // rounds each day.
  interest: Prisma.Decimal
  // What is actually credited, rounded the way the config says.
  interest_rounded: Prisma.Decimal
  // How much of `interest` each band earned, before any per-day rounding — so a progressive
  // card shows where the money came from.
  by_slab: SlabInterest[]
}

function round_credit(interest: Prisma.Decimal, rounding: InterestConfig['rounding']): Prisma.Decimal {
  switch (rounding) {
    case 'nearest_rupee':
      return interest.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    // Interest is never negative, so rounding away from zero is rounding up.
    case 'round_up_rupee':
      return interest.toDecimalPlaces(0, Prisma.Decimal.ROUND_UP)
    case 'paise':
      return interest.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  }
}

// Movements dated before `from` are part of the opening balance and ones after `to` are
// ignored, so a caller can hand over an account's whole history with opening_balance 0
// rather than splitting it at the boundary itself.
export function compute_daily_balance_interest(input: {
  opening_balance: Prisma.Decimal
  movements: DailyMovement[]
  from: string
  to: string
  config: InterestConfig
}): DailyBalanceInterest {
  const first = day_number(input.from)
  const days = inclusive_days(input.from, input.to)
  const last = first + days - 1
  const { slabs, day_basis, rounding, round_each_day } = input.config

  let balance = input.opening_balance
  const by_day = new Map<number, Prisma.Decimal>()
  for (const mv of input.movements) {
    const n = day_number(mv.day)
    if (n > last) continue
    if (n < first) balance = balance.plus(mv.amount)
    else by_day.set(n, (by_day.get(n) ?? new Prisma.Decimal(0)).plus(mv.amount))
  }

  const zero = new Prisma.Decimal(0)
  const bands = slabs.map(s => ({
    top: s.up_to === null ? null : new Prisma.Decimal(s.up_to),
    rate: new Prisma.Decimal(s.rate_pct),
    raw: zero,
  }))
  let earning_sum = zero
  let interest = zero
  let lowest: Prisma.Decimal | null = null
  let highest: Prisma.Decimal | null = null
  let negative_days = 0
  for (let n = first; n <= last; n++) {
    const moved = by_day.get(n)
    if (moved) balance = balance.plus(moved)
    if (balance.isNegative() && !balance.isZero()) negative_days++
    else {
      earning_sum = earning_sum.plus(balance)
      const year_days = days_in_year_basis(n, day_basis)
      let day_interest = zero
      let band_floor = zero
      for (const band of bands) {
        if (!balance.greaterThan(band_floor)) break
        const in_band = (band.top === null || balance.lessThan(band.top) ? balance : band.top).minus(band_floor)
        const earned = in_band.times(band.rate).dividedBy(100).dividedBy(year_days)
        band.raw = band.raw.plus(earned)
        day_interest = day_interest.plus(earned)
        if (band.top === null) break
        band_floor = band.top
      }
      interest = interest.plus(round_each_day ? day_interest.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : day_interest)
    }
    if (lowest === null || balance.lessThan(lowest)) lowest = balance
    if (highest === null || balance.greaterThan(highest)) highest = balance
  }

  return {
    days,
    average_balance: earning_sum.dividedBy(days),
    lowest_balance: lowest ?? zero,
    highest_balance: highest ?? zero,
    negative_days,
    interest,
    interest_rounded: round_credit(interest, rounding),
    by_slab: bands.map((b, i) => ({ up_to: slabs[i].up_to, rate_pct: slabs[i].rate_pct, interest: b.raw })),
  }
}
