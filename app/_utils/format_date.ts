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

const date_fmt = new Intl.DateTimeFormat('en-US', { timeZone: USER_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const time_fmt = new Intl.DateTimeFormat('en-US', { timeZone: USER_TIMEZONE, hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })

// Assemble the parts ourselves so differences in runtime locale data do not change the SSR text.
function parts(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]))
}

function day_parts(date: Date) {
  const { weekday, day, month, year } = parts(date_fmt, date)
  return { weekday, day, month: month === 'Sep' ? 'Sept' : month, year }
}

export function format_day(input: Date | string): string {
  const d = to_date(input)
  if (!d) return ''
  const { day, month, year } = day_parts(d)
  return `${day} ${month} ${year}`
}

/** Day and month alone ("30 Sept"), for labels where the year is already clear. */
export function format_day_month(input: Date | string): string {
  const d = to_date(input)
  if (!d) return ''
  const { day, month } = day_parts(d)
  return `${day} ${month}`
}

export function format_day_with_weekday(input: Date | string, include_year = true): string {
  const d = to_date(input)
  if (!d) return ''
  const { weekday, day, month, year } = day_parts(d)
  return `${weekday}, ${day} ${month}${include_year ? `, ${year}` : ''}`
}

/** Time of day alone ("9:00 PM"), for rows that already sit under their day. */
export function format_time(input: Date | string): string {
  const d = to_date(input)
  if (!d) return ''
  const { hour, minute, dayPeriod } = parts(time_fmt, d)
  return `${hour}:${minute} ${dayPeriod.toUpperCase()}`
}

export function format_datetime(input: Date | string): string {
  const d = to_date(input)
  return d ? `${format_day(d)}, ${format_time(d)}` : ''
}
