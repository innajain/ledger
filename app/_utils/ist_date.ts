import { USER_TIMEZONE } from '@/lib/config'

// Dependency-free IST calendar helpers for client bundles — pulling date-fns +
// date-fns-tz into a form chunk for two conversions costs ~10KB gzip.

// 'en-CA' emits yyyy-MM-dd directly.
const ymd_fmt = new Intl.DateTimeFormat('en-CA', { timeZone: USER_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

export function ist_ymd(date: Date): string {
  return ymd_fmt.format(date)
}

// The instant of IST midnight for a yyyy-MM-dd calendar day. IST has no DST, so the
// fixed +05:30 offset is exact.
export function ist_midnight(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, -5, -30))
}
