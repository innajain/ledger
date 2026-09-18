import { describe, it, expect } from 'vitest'
import { is_future_txn_due } from './future_txn'

// 18-09-2026 12:00 IST.
const now = new Date('2026-09-18T06:30:00Z')

describe('is_future_txn_due', () => {
  it('is due when dated in the past', () => {
    expect(is_future_txn_due(new Date('2026-09-17T06:30:00Z'), now)).toBe(true)
  })

  it('is due earlier today, before now', () => {
    expect(is_future_txn_due(new Date('2026-09-18T03:30:00Z'), now)).toBe(true)
  })

  it('is due later today — the whole IST day counts, not just the elapsed part', () => {
    // 18-09-2026 23:59 IST, i.e. 18:29Z — still the same IST day.
    expect(is_future_txn_due(new Date('2026-09-18T18:29:00Z'), now)).toBe(true)
  })

  it('is not due at the first instant of tomorrow IST', () => {
    // 19-09-2026 00:00 IST is 18:30Z on the 18th — the next IST day already.
    expect(is_future_txn_due(new Date('2026-09-18T18:30:00Z'), now)).toBe(false)
  })

  it('is not due when dated further out', () => {
    expect(is_future_txn_due(new Date('2026-10-01T06:30:00Z'), now)).toBe(false)
  })
})
