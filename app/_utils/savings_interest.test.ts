import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { compute_daily_balance_interest } from './savings_interest'
import { flat_config, type InterestConfig } from './interest_config'

const d = (n: number | string) => new Prisma.Decimal(n)
const mv = (day: string, amount: number) => ({ day, amount: d(amount) })
const run = (over: Partial<Parameters<typeof compute_daily_balance_interest>[0]>) =>
  compute_daily_balance_interest({ opening_balance: d(0), movements: [], from: '2026-04-01', to: '2026-06-30', config: flat_config(2.5), ...over })

describe('compute_daily_balance_interest', () => {
  it('pays rate/365 on a flat balance for every day of the period', () => {
    const r = run({ opening_balance: d(100000) })
    expect(r.days).toBe(91)
    // 1,00,000 x 2.5% x 91/365
    expect(r.interest.toFixed(4)).toBe('623.2877')
    expect(r.interest_rounded.toNumber()).toBe(623)
    expect(r.average_balance.toNumber()).toBe(100000)
    expect(r.negative_days).toBe(0)
  })

  it('counts a movement from the day it lands, that day included', () => {
    // 10 days at 0, then 20 days at 36,500: 20 x 36,500 x 2.5% / 365 = 50
    const r = run({ from: '2026-04-01', to: '2026-04-30', movements: [mv('2026-04-11', 36500)] })
    expect(r.interest.toNumber()).toBe(50)
    expect(r.lowest_balance.toNumber()).toBe(0)
    expect(r.highest_balance.toNumber()).toBe(36500)
  })

  it('earns one day on a movement dated the last day, and a full period on one dated the first', () => {
    const last = run({ from: '2026-04-01', to: '2026-04-30', movements: [mv('2026-04-30', 36500)] })
    expect(last.interest.toNumber()).toBe(2.5)
    const first = run({ from: '2026-04-01', to: '2026-04-30', movements: [mv('2026-04-01', 36500)] })
    expect(first.interest.toNumber()).toBe(75)
  })

  it('nets same-day movements, so money in and out within a day earns nothing', () => {
    const r = run({ from: '2026-04-01', to: '2026-04-30', movements: [mv('2026-04-10', 50000), mv('2026-04-10', -50000)] })
    expect(r.interest.toNumber()).toBe(0)
  })

  it('folds movements before the period into the opening balance and ignores later ones', () => {
    const r = run({
      from: '2026-04-01',
      to: '2026-04-30',
      opening_balance: d(500),
      movements: [mv('2025-12-01', 30000), mv('2026-03-31', 6000), mv('2026-05-01', 99999)],
    })
    // 36,500 for 30 days
    expect(r.interest.toNumber()).toBe(75)
    expect(r.average_balance.toNumber()).toBe(36500)
  })

  it('pays nothing on days that close below zero, and says how many there were', () => {
    // 10 days at -36,500 earn nothing; then 20 days at 36,500
    const r = run({ from: '2026-04-01', to: '2026-04-30', opening_balance: d(-36500), movements: [mv('2026-04-11', 73000)] })
    expect(r.negative_days).toBe(10)
    expect(r.interest.toNumber()).toBe(50)
    expect(r.lowest_balance.toNumber()).toBe(-36500)
    // the average is of the earning balance, so it still reproduces the interest
    expect(r.average_balance.times(2.5).dividedBy(100).times(30).dividedBy(365).toNumber()).toBe(50)
  })

  it('rounds to the nearest rupee, half up', () => {
    // 7,300 x 2.5% / 365 = exactly 0.50 a day
    expect(run({ from: '2026-04-01', to: '2026-04-01', opening_balance: d(7300) }).interest_rounded.toNumber()).toBe(1)
    expect(run({ from: '2026-04-01', to: '2026-04-01', opening_balance: d(7299) }).interest_rounded.toNumber()).toBe(0)
  })

  it('divides by 365 in a leap year too', () => {
    const r = run({ from: '2028-01-01', to: '2028-12-31', opening_balance: d(36500), config: flat_config(1) })
    expect(r.days).toBe(366)
    expect(r.interest.toNumber()).toBe(366)
  })

  it('keeps paise exact across many small movements', () => {
    const movements = Array.from({ length: 90 }, (_, i) => mv(`2026-04-${String((i % 30) + 1).padStart(2, '0')}`, 0.1))
    const r = run({ from: '2026-04-01', to: '2026-04-30', movements })
    // three 0.10 credits a day: the balance closes day n at 0.30 x n
    expect(r.highest_balance.toString()).toBe('9')
    expect(r.average_balance.toString()).toBe('4.65')
  })
})

// IDFC FIRST's card from 1 Sep 2026: 2.5% up to ₹3 lakh, 7% on ₹3–25 lakh, 6.25% on ₹25 lakh–5 crore, 5% above;
// progressive, monthly credit, rounded up to the next rupee, financial-year day count.
const idfc: InterestConfig = {
  slabs: [
    { up_to: 300000, rate_pct: 2.5 },
    { up_to: 2500000, rate_pct: 7 },
    { up_to: 50000000, rate_pct: 6.25 },
    { up_to: null, rate_pct: 5 },
  ],
  day_basis: 'financial_year',
  rounding: 'round_up_rupee',
  round_each_day: false,
}

describe('progressive slabs', () => {
  const one_day = (balance: number, config: InterestConfig) =>
    compute_daily_balance_interest({ opening_balance: d(balance), movements: [], from: '2026-09-15', to: '2026-09-15', config })

  it('pays the lowest band on the whole of a small balance', () => {
    // 25,000 x 2.5% / 365
    expect(one_day(25000, idfc).interest.toFixed(6)).toBe('1.712329')
  })

  it("applies each band's rate only to the part of the balance inside it (the bank's own example)", () => {
    // ₹10 lakh: 2.5% on ₹3 lakh and 7% on the remaining ₹7 lakh
    const r = one_day(1000000, idfc)
    const expected = d(300000).times(2.5).dividedBy(100).dividedBy(365).plus(d(700000).times(7).dividedBy(100).dividedBy(365))
    expect(r.interest.toFixed(8)).toBe(expected.toFixed(8))
    expect(r.by_slab.map(s => s.interest.toFixed(4))).toEqual(['20.5479', '134.2466', '0.0000', '0.0000'])
  })

  it('reaches the upper bands only past their floor', () => {
    const r = one_day(3000000, idfc)
    // 3 lakh @2.5, 22 lakh @7, 5 lakh @6.25
    const expected = d(300000).times(2.5).plus(d(2200000).times(7)).plus(d(500000).times(6.25)).dividedBy(100).dividedBy(365)
    expect(r.interest.toFixed(8)).toBe(expected.toFixed(8))
    expect(r.by_slab[3].interest.toNumber()).toBe(0)
  })

  it('a balance exactly on a band edge earns nothing in the next band', () => {
    const r = one_day(300000, idfc)
    expect(r.by_slab[1].interest.toNumber()).toBe(0)
    expect(r.interest.toFixed(8)).toBe(d(300000).times(2.5).dividedBy(100).dividedBy(365).toFixed(8))
  })

  it('keeps by_slab summing to the interest when nothing is rounded per day', () => {
    const r = one_day(40000000, idfc)
    expect(r.by_slab.reduce((sum, s) => sum.plus(s.interest), d(0)).toFixed(10)).toBe(r.interest.toFixed(10))
  })

  it('a one-band config matches the flat rate', () => {
    const flat = compute_daily_balance_interest({
      opening_balance: d(36500),
      movements: [],
      from: '2026-04-01',
      to: '2026-04-30',
      config: flat_config(2.5),
    })
    expect(flat.interest.toNumber()).toBe(75)
  })
})

describe('day basis', () => {
  const year_of_interest = (day_basis: InterestConfig['day_basis'], from: string, to: string) =>
    compute_daily_balance_interest({ opening_balance: d(36500), movements: [], from, to, config: { ...flat_config(10), day_basis } })

  it('divides by 366 in a leap financial year, 365 otherwise', () => {
    // 36,500 @10% for the 366 days of FY 2027-28 is exactly 366 x 10 = 3,660 on 365, or 3,650 on 366
    expect(year_of_interest('financial_year', '2027-04-01', '2028-03-31').interest.toFixed(4)).toBe('3650.0000')
    expect(year_of_interest('fixed_365', '2027-04-01', '2028-03-31').interest.toFixed(4)).toBe('3660.0000')
    expect(year_of_interest('financial_year', '2026-04-01', '2027-03-31').interest.toFixed(4)).toBe('3650.0000')
  })

  it('follows the calendar year when asked', () => {
    // all of 2028: 366 days on a 366 divisor is a flat 10% of the balance
    expect(year_of_interest('calendar_year', '2028-01-01', '2028-12-31').interest.toFixed(4)).toBe('3650.0000')
    expect(year_of_interest('calendar_year', '2027-01-01', '2027-12-31').interest.toFixed(4)).toBe('3650.0000')
  })
})

describe('rounding', () => {
  // ₹36,500 at 10%: exactly ₹10 a day
  const run_with = (over: Partial<InterestConfig>, balance = 36500, to = '2026-04-03') =>
    compute_daily_balance_interest({ opening_balance: d(balance), movements: [], from: '2026-04-01', to, config: { ...flat_config(10), ...over } })

  it('rounds up to the next rupee, and leaves a whole rupee alone', () => {
    // 36,501 @10% over 3 days = 30.0008...
    expect(run_with({ rounding: 'round_up_rupee' }, 36501).interest_rounded.toNumber()).toBe(31)
    expect(run_with({ rounding: 'nearest_rupee' }, 36501).interest_rounded.toNumber()).toBe(30)
    expect(run_with({ rounding: 'round_up_rupee' }, 36500).interest_rounded.toNumber()).toBe(30)
  })

  it('keeps the paisa when asked', () => {
    // 36,510 @10% over 3 days = 30.0082...
    expect(run_with({ rounding: 'paise' }, 36510).interest_rounded.toString()).toBe('30.01')
  })

  it('rounds each day to the paisa before summing, which can differ from rounding the total', () => {
    // ₹100 at 10%: 0.0274 a day exactly. Each day credited on its own is 0.03, so 30 days is 0.90 — against 0.82 unrounded
    const daily = run_with({ round_each_day: true, rounding: 'paise' }, 100, '2026-04-30')
    const exact = run_with({ round_each_day: false, rounding: 'paise' }, 100, '2026-04-30')
    expect(daily.interest.toString()).toBe('0.9')
    expect(exact.interest.toFixed(2)).toBe('0.82')
  })

  it("follows the bank's own daily formula, balance x rate / (100 x days in the year), to the paisa", () => {
    // Slice's published example says ₹1,00,000 at 6.25% earns ₹17.81 a day, but its own formula gives ₹17.12
    // (₹17.81 is what 6.5% gives) — the formula is what is implemented
    const r = compute_daily_balance_interest({
      opening_balance: d(100000),
      movements: [],
      from: '2026-04-01',
      to: '2026-04-01',
      config: { ...flat_config(6.25), round_each_day: true, rounding: 'paise', day_basis: 'calendar_year' },
    })
    expect(r.interest_rounded.toString()).toBe('17.12')
  })
})
