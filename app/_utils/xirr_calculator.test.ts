import { describe, it, expect } from 'vitest'
import { calculate_xirr } from './xirr_calculator'

const date = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))

describe('calculate_xirr', () => {
  it('returns null with fewer than two cashflows', () => {
    expect(calculate_xirr([{ amount: -100, when: date(2024, 1, 1) }])).toBeNull()
  })

  it('returns null when all flows share a sign (no investment + return)', () => {
    expect(
      calculate_xirr([
        { amount: -100, when: date(2024, 1, 1) },
        { amount: -50, when: date(2024, 6, 1) },
      ]),
    ).toBeNull()
  })

  it('returns null when every flow is on the same day', () => {
    expect(
      calculate_xirr([
        { amount: -100, when: date(2024, 1, 1) },
        { amount: 110, when: date(2024, 1, 1) },
      ]),
    ).toBeNull()
  })

  it('computes ~10% for a 10% gain held exactly one year', () => {
    const rate = calculate_xirr([
      { amount: -100, when: date(2023, 1, 1) },
      { amount: 110, when: date(2024, 1, 1) },
    ])
    expect(rate).not.toBeNull()
    expect(rate!).toBeCloseTo(0.1, 2)
  })

  it('computes ~100% for a doubling over one year', () => {
    const rate = calculate_xirr([
      { amount: -100, when: date(2023, 1, 1) },
      { amount: 200, when: date(2024, 1, 1) },
    ])
    expect(rate!).toBeCloseTo(1.0, 2)
  })

  it('snaps a flat (zero-return) result to exactly 0', () => {
    const rate = calculate_xirr([
      { amount: -100, when: date(2023, 1, 1) },
      { amount: 100, when: date(2024, 1, 1) },
    ])
    expect(rate).toBe(0)
  })

  it('rejects absurd annualized returns from tiny time windows as noise', () => {
    // A near-instant 100% gain annualizes to an astronomical rate (>1000%).
    const rate = calculate_xirr([
      { amount: -100, when: date(2024, 1, 1) },
      { amount: 200, when: date(2024, 1, 2) },
    ])
    expect(rate).toBeNull()
  })
})
