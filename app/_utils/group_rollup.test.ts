import { describe, it, expect } from 'vitest'
import { summarize_group_flow } from './group_rollup'

const real = (net: number) => ({ net, is_future: false })
const future = (net: number) => ({ net, is_future: true })

describe('summarize_group_flow', () => {
  it('is all zeroes for an empty group', () => {
    expect(summarize_group_flow([])).toEqual({ count: 0, future_count: 0, inflow: 0, outflow: 0, net: 0 })
  })

  it('splits spend from income and reports outflow as a positive number', () => {
    expect(summarize_group_flow([real(-350), real(-120.5), real(80)])).toEqual({
      count: 3,
      future_count: 0,
      inflow: 80,
      outflow: 470.5,
      net: -390.5,
    })
  })

  it('counts future members without adding them up', () => {
    // The scheduled ₹500 lunch affects no balance elsewhere in the ledger, so it
    // must not move this group's total either.
    expect(summarize_group_flow([real(-350), future(-500)])).toEqual({
      count: 1,
      future_count: 1,
      inflow: 0,
      outflow: 350,
      net: -350,
    })
  })

  it('counts a zero-net transfer as a member contributing nothing', () => {
    expect(summarize_group_flow([real(0), real(-100)])).toEqual({ count: 2, future_count: 0, inflow: 0, outflow: 100, net: -100 })
  })

  it('rounds accumulated float error to paise', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in float; the group must not report that.
    expect(summarize_group_flow([real(0.1), real(0.2)])).toEqual({ count: 2, future_count: 0, inflow: 0.3, outflow: 0, net: 0.3 })
  })
})
