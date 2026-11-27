import { describe, expect, it, vi } from 'vitest'
import { format_day_month, format_day_with_weekday, format_datetime, format_time } from './format_date'

describe('format_day_with_weekday', () => {
  it('keeps the same date and punctuation at the IST midnight boundary', () => {
    expect(format_day_with_weekday('2026-09-30T18:29:00Z')).toBe('Wed, 30 Sept, 2026')
    expect(format_day_with_weekday('2026-09-30T18:30:00Z')).toBe('Thu, 1 Oct, 2026')
    expect(format_day_with_weekday('2026-09-30', false)).toBe('Wed, 30 Sept')
  })
})

describe('format_day_month', () => {
  it('renders the IST day and month without the year', () => {
    expect(format_day_month('2026-09-30T18:29:00Z')).toBe('30 Sept')
    expect(format_day_month('2026-09-30T18:30:00Z')).toBe('1 Oct')
    expect(format_day_month('2026-09-30')).toBe('30 Sept')
    expect(format_day_month('not a date')).toBe('')
  })
})

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

  it('keeps IST time during a daylight-saving gap in other time zones', () => {
    vi.stubEnv('TZ', 'America/New_York')
    try {
      expect(format_datetime('2026-03-07T21:00:00Z')).toBe('8 Mar 2026, 2:30 AM')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('returns an empty string for an unparseable value', () => {
    expect(format_time('not a date')).toBe('')
  })
})
