function to_date(input: Date | string): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input
  // bare yyyy-MM-dd must stay a calendar day, not shift through UTC parsing
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(input)
  return isNaN(d.getTime()) ? null : d
}

// Deliberately no timeZone: these format in the viewer's local zone (unlike the
// transactions page's IST-pinned formatters).
const day_fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const time_fmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })

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
