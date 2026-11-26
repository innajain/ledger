import { describe, expect, it } from 'vitest'
import { format_datetime, format_time } from './format_date'

describe('format_time', () => {
  it('renders the IST time of day in 12-hour form, upper-case', () => {
    // 15:30Z is 21:00 IST
    expect(format_time('2026-11-26T15:30:00Z')).toBe('9:00 PM')
    expect(format_time(new Date('2026-11-26T03:36:00Z'))).toBe('9:06 AM')
  })

  it('matches the time half of format_datetime', () => {
    const at = '2026-11-26T13:36:00Z'
    expect(format_datetime(at)).toBe(`26 Nov 2026, ${format_time(at)}`)
  })

  it('returns an empty string for an unparseable value', () => {
    expect(format_time('not a date')).toBe('')
  })
})
