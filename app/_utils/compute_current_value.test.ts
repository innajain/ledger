import { describe, it, expect } from 'vitest'
import { Prisma, asset_type } from '@/generated/prisma/client'
import { compute_current_value } from './compute_current_value'

const d = (n: number) => new Prisma.Decimal(n)

describe('compute_current_value', () => {
  it('values rupees at their quantity, ignoring price/book', () => {
    expect(compute_current_value(asset_type.rupees, d(500), d(999), d(123)).toNumber()).toBe(500)
  })

  it('values a priced non-rupees asset at price × qty', () => {
    expect(compute_current_value(asset_type.mf, d(10), d(25), d(999)).toNumber()).toBe(250)
  })

  it('falls back to book (txn_value) when a non-rupees asset has no price', () => {
    expect(compute_current_value(asset_type.etf, d(10), null, d(777)).toNumber()).toBe(777)
  })

  it('uses a zero price rather than falling back to book', () => {
    expect(compute_current_value(asset_type.shares, d(10), d(0), d(777)).toNumber()).toBe(0)
  })

  it('handles negative (short / liability) quantities', () => {
    expect(compute_current_value(asset_type.mf, d(-4), d(50), d(0)).toNumber()).toBe(-200)
  })
})
