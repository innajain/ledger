// Calendar-day helpers for interest periods. Dependency-free on purpose: the interest card
// is a client component and builds its quarter picker from these, so nothing here may pull
// the Prisma client (and its Decimal) into the browser bundle.

const DAY_MS = 24 * 60 * 60 * 1000

// yyyy-MM-dd -> days since the epoch, on the UTC calendar. Calendar days carry no zone, so
// UTC arithmetic is exact and immune to wherever the code happens to run.
export function day_number(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) throw new Error(`Invalid day "${ymd}" — expected yyyy-MM-dd`)
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(y, mo - 1, d)
  // Date.UTC rolls 31 Feb into March instead of rejecting it; round-trip to catch that.
  const back = new Date(ms)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) throw new Error(`Invalid day "${ymd}"`)
  return ms / DAY_MS
}

function day_string(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10)
}

// Number of days in the inclusive range, or a throw when it is malformed or backwards.
export function inclusive_days(from: string, to: string): number {
  const days = day_number(to) - day_number(from) + 1
  if (days < 1) throw new Error('The period ends before it starts')
  return days
}

export type InterestPeriod = { label: string; from: string; to: string }
export type InterestFrequency = 'monthly' | 'quarterly'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Calendar periods of `span` months, the way a bank cuts the interest it credits: monthly
// ones for banks that pay every month, quarterly for most. `count` periods completed
// before `today` (yyyy-MM-dd), newest first. include_current puts the one in progress
// ahead of them, cut at today: an "earned so far" figure. The period containing today is
// always in progress, its last day included, since that day has not closed yet.
function recent_periods(today: string, span: 1 | 3, count: number, include_current: boolean): InterestPeriod[] {
  day_number(today)
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
  const per_year = 12 / span
  // Index of the period containing today, counted in periods since year 0.
  const current = y * per_year + Math.floor((m - 1) / span)
  const period = (index: number): InterestPeriod => {
    const year = Math.floor(index / per_year)
    const start_month = (index % per_year) * span
    const from = day_string(Date.UTC(year, start_month, 1) / DAY_MS)
    // Day 0 of the month after the period is the period's last day.
    const to = day_string(Date.UTC(year, start_month + span, 0) / DAY_MS)
    const name = span === 1 ? MONTH[start_month] : `${MONTH[start_month]}–${MONTH[start_month + span - 1]}`
    return { label: `${name} ${year}`, from, to }
  }

  const out: InterestPeriod[] = []
  if (include_current) {
    const in_progress = period(current)
    out.push({ ...in_progress, to: today, label: `${in_progress.label} so far` })
  }
  for (let i = 1; i <= count; i++) out.push(period(current - i))
  return out
}

export const recent_quarters = (today: string, count: number, include_current = false) => recent_periods(today, 3, count, include_current)
export const recent_months = (today: string, count: number, include_current = false) => recent_periods(today, 1, count, include_current)

export function recent_interest_periods(frequency: InterestFrequency, today: string, count: number, include_current = false): InterestPeriod[] {
  return frequency === 'monthly' ? recent_months(today, count, include_current) : recent_quarters(today, count, include_current)
}
