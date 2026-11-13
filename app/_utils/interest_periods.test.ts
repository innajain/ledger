import { describe, it, expect } from 'vitest'
import { inclusive_days, recent_quarters, recent_months, recent_interest_periods } from './interest_periods'

describe('inclusive_days', () => {
  it('counts both ends', () => {
    expect(inclusive_days('2026-04-01', '2026-04-01')).toBe(1)
    expect(inclusive_days('2026-04-01', '2026-06-30')).toBe(91)
  })

  it('counts 29 Feb in a leap year', () => {
    expect(inclusive_days('2028-02-28', '2028-03-01')).toBe(3)
    expect(inclusive_days('2027-02-28', '2027-03-01')).toBe(2)
  })

  it('rejects a backwards range', () => {
    expect(() => inclusive_days('2026-04-02', '2026-04-01')).toThrow(/ends before it starts/)
  })

  it('rejects malformed and impossible days', () => {
    expect(() => inclusive_days('01-04-2026', '2026-04-30')).toThrow(/yyyy-MM-dd/)
    expect(() => inclusive_days('2026-02-31', '2026-03-31')).toThrow(/Invalid day/)
  })
})

describe('recent_quarters', () => {
  it('lists completed quarters newest first', () => {
    expect(recent_quarters('2026-11-13', 3)).toEqual([
      { label: 'Jul–Sep 2026', from: '2026-07-01', to: '2026-09-30' },
      { label: 'Apr–Jun 2026', from: '2026-04-01', to: '2026-06-30' },
      { label: 'Jan–Mar 2026', from: '2026-01-01', to: '2026-03-31' },
    ])
  })

  it('crosses the year boundary', () => {
    expect(recent_quarters('2026-02-10', 2)).toEqual([
      { label: 'Oct–Dec 2025', from: '2025-10-01', to: '2025-12-31' },
      { label: 'Jul–Sep 2025', from: '2025-07-01', to: '2025-09-30' },
    ])
  })

  it('puts the quarter in progress first, cut at today', () => {
    const [current, previous] = recent_quarters('2026-11-13', 1, true)
    expect(current).toEqual({ label: 'Oct–Dec 2026 so far', from: '2026-10-01', to: '2026-11-13' })
    expect(previous.label).toBe('Jul–Sep 2026')
  })

  it('treats the last day of a quarter as still in progress', () => {
    expect(recent_quarters('2026-09-30', 1)[0].label).toBe('Apr–Jun 2026')
    expect(recent_quarters('2026-10-01', 1)[0].label).toBe('Jul–Sep 2026')
  })

  it('handles a quarter in a leap year', () => {
    expect(recent_quarters('2028-05-01', 1)[0]).toEqual({ label: 'Jan–Mar 2028', from: '2028-01-01', to: '2028-03-31' })
  })
})

describe('recent_months', () => {
  it('lists completed months newest first, across a year boundary', () => {
    expect(recent_months('2026-02-10', 3)).toEqual([
      { label: 'Jan 2026', from: '2026-01-01', to: '2026-01-31' },
      { label: 'Dec 2025', from: '2025-12-01', to: '2025-12-31' },
      { label: 'Nov 2025', from: '2025-11-01', to: '2025-11-30' },
    ])
  })

  it('ends February on the 28th or 29th', () => {
    expect(recent_months('2027-03-05', 1)[0]).toEqual({ label: 'Feb 2027', from: '2027-02-01', to: '2027-02-28' })
    expect(recent_months('2028-03-05', 1)[0]).toEqual({ label: 'Feb 2028', from: '2028-02-01', to: '2028-02-29' })
  })

  it('puts the month in progress first, cut at today, and treats its last day as still open', () => {
    expect(recent_months('2026-11-13', 1, true)).toEqual([
      { label: 'Nov 2026 so far', from: '2026-11-01', to: '2026-11-13' },
      { label: 'Oct 2026', from: '2026-10-01', to: '2026-10-31' },
    ])
    expect(recent_months('2026-10-31', 1)[0].label).toBe('Sep 2026')
    expect(recent_months('2026-11-01', 1)[0].label).toBe('Oct 2026')
  })
})

describe('recent_interest_periods', () => {
  it('picks the cut that matches how often the bank credits', () => {
    expect(recent_interest_periods('quarterly', '2026-11-13', 1)[0].label).toBe('Jul–Sep 2026')
    expect(recent_interest_periods('monthly', '2026-11-13', 1)[0].label).toBe('Oct 2026')
  })
})
