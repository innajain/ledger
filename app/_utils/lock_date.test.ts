import { describe, it, expect } from 'vitest'
import { find_locked_line, assert_no_locked_lines } from './lock_date'
import { get_date_obj_from_indian_date, next_ist_midnight } from './date'
import { ActionError } from '@/app/_actions/_result'

const ist = (s: string) => get_date_obj_from_indian_date(s) // IST midnight of dd-MM-yyyy
const lock = ist('30-04-2026')
const head = (lock_date: Date | null, name = 'Kotak') => ({ name, lock_date })

describe('next_ist_midnight', () => {
  it('returns the start of the next IST day', () => {
    expect(next_ist_midnight(ist('30-04-2026')).getTime()).toBe(ist('01-05-2026').getTime())
  })

  it('normalizes an instant mid-day to that IST day', () => {
    const midDay = new Date(ist('30-04-2026').getTime() + 10 * 3600 * 1000)
    expect(next_ist_midnight(midDay).getTime()).toBe(ist('01-05-2026').getTime())
  })
})

describe('find_locked_line', () => {
  it('passes when no head has a lock', () => {
    expect(find_locked_line(ist('08-04-2026'), [{ datetime: null, accounting_head: head(null) }])).toBeNull()
  })

  it('blocks a transaction dated on the lock day, up to the last IST second', () => {
    const endOfDay = new Date(ist('01-05-2026').getTime() - 1000)
    expect(find_locked_line(endOfDay, [{ datetime: null, accounting_head: head(lock) }])).toMatchObject({ head_name: 'Kotak' })
  })

  it('allows a transaction dated the day after the lock', () => {
    expect(find_locked_line(ist('01-05-2026'), [{ datetime: null, accounting_head: head(lock) }])).toBeNull()
  })

  it('blocks a backdated transaction well inside the locked period', () => {
    expect(find_locked_line(ist('08-04-2026'), [{ datetime: null, accounting_head: head(lock) }])).not.toBeNull()
  })

  it('uses the line-item datetime override over the transaction datetime', () => {
    const txnAfter = ist('05-05-2026')
    const lineBefore = ist('28-04-2026')
    expect(find_locked_line(txnAfter, [{ datetime: lineBefore, accounting_head: head(lock) }])).not.toBeNull()
    const txnBefore = ist('08-04-2026')
    const lineAfter = ist('05-05-2026')
    expect(find_locked_line(txnBefore, [{ datetime: lineAfter, accounting_head: head(lock) }])).toBeNull()
  })

  it('covers the whole lock day even when the lock is stored mid-day', () => {
    const lockMidDay = new Date(lock.getTime() + 10 * 3600 * 1000)
    expect(find_locked_line(ist('30-04-2026'), [{ datetime: null, accounting_head: head(lockMidDay) }])).not.toBeNull()
  })

  it('only the locked head blocks; other lines pass', () => {
    const hit = find_locked_line(ist('08-04-2026'), [
      { datetime: null, accounting_head: head(null, 'Expenses') },
      { datetime: null, accounting_head: head(lock) },
    ])
    expect(hit).toMatchObject({ head_name: 'Kotak' })
  })
})

describe('assert_no_locked_lines', () => {
  it('throws a VALIDATION ActionError naming the account and lock day', () => {
    try {
      assert_no_locked_lines('delete', ist('08-04-2026'), [{ datetime: null, accounting_head: head(lock) }])
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ActionError)
      expect((e as ActionError).code).toBe('VALIDATION')
      expect((e as ActionError).message).toContain('Kotak')
      expect((e as ActionError).message).toContain('30-04-2026')
      expect((e as ActionError).message).toContain('delete')
    }
  })

  it('does not throw for clean lines', () => {
    expect(() => assert_no_locked_lines('create', ist('01-05-2026'), [{ datetime: null, accounting_head: head(lock) }])).not.toThrow()
  })
})
