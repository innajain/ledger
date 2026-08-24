import { USER_TIMEZONE } from '@/lib/config'

function to_date(input: Date | string): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  // bare yyyy-MM-dd must stay a calendar day, not shift through UTC parsing — anchor it
  // to UTC noon so the IST-pinned formatters below always land on the same calendar day
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}

// Pinned to USER_TIMEZONE (all app dates are IST) so the same string renders on the
// server and the client — dates can be server-rendered instead of filled in after
// hydration, which used to blank every date cell in the SSR HTML.
const day_fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: USER_TIMEZONE })
const time_fmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: USER_TIMEZONE })

export function format_day(input: Date | string): string {
  const d = to_date(input)
  if (!d) return ''
  return day_fmt.format(d)
}

export function format_datetime(input: Date | string): string {
  const d = to_date(input)
  if (!d) return ''
  return `${day_fmt.format(d)}, ${time_fmt.format(d).toUpperCase()}`
}
