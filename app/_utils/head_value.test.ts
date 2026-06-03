import { describe, it, expect } from 'vitest'
import { compute_head_value, value_balance_entry } from './head_value'

describe('value_balance_entry', () => {
  it('prices qty at the live price when available', () => {
    expect(value_balance_entry(10, 999, 25).toNumber()).toBe(250)
  })

  it('falls back to txn_value when no price', () => {
    expect(value_balance_entry(10, 999, null).toNumber()).toBe(999)
  })

  it('uses price even when price is 0 (not a fallback trigger)', () => {
    expect(value_balance_entry(10, 999, 0).toNumber()).toBe(0)
  })
})

describe('compute_head_value', () => {
  const prices = new Map([
    ['mf', { price: 100 }],
    ['etf', { price: 50 }],
    ['other', null],
  ])

  it('sums priced and unpriced assets in one head', () => {
    const balances = new Map([
      ['mf', { qty: 2, txn_value: 150 }], // 2 * 100 = 200
      ['etf', { qty: 3, txn_value: 999 }], // 3 * 50 = 150
      ['other', { qty: 1, txn_value: 75 }], // no price -> 75
    ])
    expect(compute_head_value(balances, prices).toNumber()).toBe(425)
  })

  it('treats an unknown asset id as unpriced (book value)', () => {
    const balances = new Map([['unknown', { qty: 5, txn_value: 42 }]])
    expect(compute_head_value(balances, prices).toNumber()).toBe(42)
  })

  it('returns 0 for an empty balance map', () => {
    expect(compute_head_value(new Map(), prices).toNumber()).toBe(0)
  })
})
