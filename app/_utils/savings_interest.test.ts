import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { compute_daily_balance_interest } from './savings_interest'

const d = (n: number | string) => new Prisma.Decimal(n)
const mv = (day: string, amount: number) => ({ day, amount: d(amount) })
const run = (over: Partial<Parameters<typeof compute_daily_balance_interest>[0]>) =>
  compute_daily_balance_interest({ opening_balance: d(0), movements: [], from: '2026-04-01', to: '2026-06-30', annual_rate_pct: d(2.5), ...over })

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
    const r = run({ from: '2028-01-01', to: '2028-12-31', opening_balance: d(36500), annual_rate_pct: d(1) })
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
