import { describe, it, expect } from 'vitest'
import { compute_spendable } from './spendable'

const a = (id: string, name: string, total: number, parent_id: string | null = null) => ({ id, name, parent_id, total })

describe('compute_spendable', () => {
  it("reproduces the owner's real figures: the deposit takes the outside-investments sum to about zero", () => {
    // net worth 12,73,752.57 = investments 12,24,798.67 + everything else 48,953.90
    const r = compute_spendable([
      a('inv', 'Investments', 1224798.67),
      a('dep', 'House Security Deposit', 50000),
      a('ins', 'Parents Health Insurance', 42206.62),
      a('disc', 'Discretionary Expenses', -50209.46),
      a('big', 'Big Ticket Expenses', -47831.39),
      a('rest', 'Everything else', 54788.13),
    ])
    expect(r.net_worth).toBe(1273752.57)
    expect(r.investments).toBe(1224798.67)
    expect(r.outside_investments).toBe(48953.9)
    expect(r.locked).toEqual([{ name: 'House Security Deposit', total: 50000 }])
    expect(r.spendable).toBe(-1046.1)
  })

  it('counts a locked head with its whole subtree', () => {
    const r = compute_spendable([
      a('inv', 'Investments', 100),
      a('dep', 'House Security Deposit', 40000),
      a('rent', 'Rent deposit', 10000, 'dep'),
      a('x', 'Other', 500),
    ])
    expect(r.locked).toEqual([{ name: 'House Security Deposit', total: 50000 }])
    expect(r.outside_investments).toBe(50500)
    expect(r.spendable).toBe(500)
  })

  it('counts investments with their subtree too', () => {
    const r = compute_spendable([a('inv', 'Investments', 100), a('mf', 'Mutual funds', 900, 'inv'), a('x', 'Other', 50)])
    expect(r.investments).toBe(1000)
    expect(r.outside_investments).toBe(50)
  })

  it('takes nothing out for a head that does not exist', () => {
    const r = compute_spendable([a('x', 'Groceries', 200), a('y', 'Rent', -50)])
    expect(r.investments).toBe(0)
    expect(r.locked).toEqual([])
    expect(r.locked_total).toBe(0)
    expect(r.outside_investments).toBe(150)
    expect(r.spendable).toBe(150)
  })

  it('does not count a locked head twice when it sits inside Investments', () => {
    // the deposit is under Investments: it is already out as invested, so it is not also "locked"
    const r = compute_spendable([a('inv', 'Investments', 100), a('dep', 'House Security Deposit', 50000, 'inv'), a('x', 'Other', 30)])
    expect(r.investments).toBe(50100)
    expect(r.locked).toEqual([])
    expect(r.spendable).toBe(30)
  })

  it('handles an empty ledger', () => {
    expect(compute_spendable([])).toEqual({ net_worth: 0, investments: 0, outside_investments: 0, locked: [], locked_total: 0, spendable: 0 })
  })

  it('keeps paise exact, not float noise', () => {
    const r = compute_spendable([a('inv', 'Investments', 0.1), a('x', 'A', 0.2), a('y', 'B', 0.4)])
    expect(r.net_worth).toBe(0.7)
    expect(r.outside_investments).toBe(0.6)
  })

  it('goes negative when overspent envelopes outweigh what is set aside', () => {
    const r = compute_spendable([a('inv', 'Investments', 500), a('disc', 'Discretionary', -2000), a('ins', 'Insurance', 300)])
    expect(r.spendable).toBe(-1700)
  })
})
