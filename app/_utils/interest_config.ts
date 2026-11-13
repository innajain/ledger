// How a bank works its savings interest out. Dependency-free on purpose — the interest
// card is a client component and imports the defaults and the type from here, so nothing
// in this file may pull the Prisma client into the browser bundle.

// One band of a progressive rate card. `up_to` is the top of the band in rupees; null
// means no upper limit (the last band only). A band's rate applies only to the part of the
// balance inside it: ₹10 lakh on 2.5% up to ₹3 lakh then 7% earns 2.5% on ₹3 lakh and 7%
// on the other ₹7 lakh.
export type RateSlab = { up_to: number | null; rate_pct: number }

// What a year is, for the rate/year divisor. Banks differ: most state 365 flat; some use
// the days in the year the interest falls in, and IDFC FIRST uses the financial year
// (Apr–Mar), which is a 366-day year when it contains 29 February.
export type DayBasis = 'fixed_365' | 'calendar_year' | 'financial_year'

// How the total is turned into a credit. Most banks credit whole rupees, nearest; IDFC
// FIRST rounds UP to the next rupee; a bank that credits daily (Slice) is paid to the
// paisa, so 'paise' keeps it.
export type InterestRounding = 'nearest_rupee' | 'round_up_rupee' | 'paise'

export type InterestConfig = {
  slabs: RateSlab[]
  day_basis: DayBasis
  rounding: InterestRounding
  // Round each day's interest to the paisa before summing. A bank that credits daily
  // credits each day's amount on its own, so the paise it drops add up.
  round_each_day: boolean
}

// How often the bank credits interest. It only decides which periods the card and the tool
// offer — the calculation itself is period-agnostic.
export type InterestFrequency = 'monthly' | 'quarterly'

// What is saved on an account: the rate card and how the bank rounds it, plus how often it
// credits, so checking a credit needs only the dates.
export type InterestSettings = InterestConfig & { frequency: InterestFrequency }

export const FREQUENCIES: readonly InterestFrequency[] = ['quarterly', 'monthly']

export const DAY_BASES: readonly DayBasis[] = ['fixed_365', 'calendar_year', 'financial_year']
export const ROUNDINGS: readonly InterestRounding[] = ['nearest_rupee', 'round_up_rupee', 'paise']

export const MAX_SLABS = 10

// A single flat rate on every rupee — what most banks quote, and what the card starts with.
export function flat_config(rate_pct: number): InterestConfig {
  return { slabs: [{ up_to: null, rate_pct }], day_basis: 'fixed_365', rounding: 'nearest_rupee', round_each_day: false }
}

function is_record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Only a property the caller set on the object itself counts: one that merely shows up
// through the prototype chain is not input.
function own(o: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined
}

// Checks untrusted input (a server action argument, an MCP tool call) and returns it in
// the shape the calculation reads, or throws an Error whose message says what to fix.
// Missing options fall back to the flat-rate defaults, so a caller that only knows a rate
// can send just the slabs.
export function validate_interest_config(raw: unknown): InterestConfig {
  if (!is_record(raw)) throw new Error('Interest settings are missing')
  const slabs = own(raw, 'slabs')
  const day_basis = own(raw, 'day_basis') ?? 'fixed_365'
  const rounding = own(raw, 'rounding') ?? 'nearest_rupee'
  const round_each_day = own(raw, 'round_each_day') ?? false

  if (!Array.isArray(slabs) || slabs.length === 0) throw new Error('Give at least one rate')
  if (slabs.length > MAX_SLABS) throw new Error(`Use at most ${MAX_SLABS} rate bands`)
  const out: RateSlab[] = []
  let previous_top = 0
  for (let i = 0; i < slabs.length; i++) {
    const s: unknown = slabs[i]
    const label = slabs.length === 1 ? 'The rate' : `Band ${i + 1}`
    if (!is_record(s)) throw new Error(`${label} is malformed`)
    const up_to = own(s, 'up_to')
    const rate_pct = own(s, 'rate_pct')
    if (typeof rate_pct !== 'number' || !Number.isFinite(rate_pct) || rate_pct < 0 || rate_pct > 100) {
      throw new Error(`${label}: the rate must be between 0 and 100% a year`)
    }
    const last = i === slabs.length - 1
    if (last) {
      if (up_to !== null && up_to !== undefined) throw new Error(`${label}: the last band must have no upper limit`)
      out.push({ up_to: null, rate_pct })
    } else {
      if (typeof up_to !== 'number' || !Number.isFinite(up_to) || up_to <= previous_top) {
        throw new Error(`${label}: the upper limit must be above the previous band's (${previous_top.toLocaleString('en-IN')})`)
      }
      previous_top = up_to
      out.push({ up_to, rate_pct })
    }
  }
  if (!out.some(s => s.rate_pct > 0)) throw new Error('At least one band needs a rate above 0%')

  if (typeof day_basis !== 'string' || !DAY_BASES.includes(day_basis as DayBasis)) throw new Error('Unknown day basis')
  if (typeof rounding !== 'string' || !ROUNDINGS.includes(rounding as InterestRounding)) throw new Error('Unknown rounding')
  if (typeof round_each_day !== 'boolean') throw new Error('round_each_day must be true or false')

  return { slabs: out, day_basis: day_basis as DayBasis, rounding: rounding as InterestRounding, round_each_day }
}

// The same checks plus the credit frequency, for what gets saved on an account. Throws an
// Error whose message says what to fix; an omitted frequency is quarterly.
export function validate_interest_settings(raw: unknown): InterestSettings {
  const config = validate_interest_config(raw)
  // validate_interest_config has already proved `raw` is a record.
  const frequency = own(raw as Record<string, unknown>, 'frequency') ?? 'quarterly'
  if (typeof frequency !== 'string' || !FREQUENCIES.includes(frequency as InterestFrequency)) throw new Error('Unknown credit frequency')
  return { ...config, frequency: frequency as InterestFrequency }
}

// Reads a saved value back out of the database. It is JSON a past version of the code
// wrote, so it is checked like any other input — and one that no longer passes is treated as
// not saved rather than trusted, which beats a calculation on a rate card nobody can read.
export function parse_saved_interest_settings(raw: unknown): InterestSettings | null {
  if (raw === null || raw === undefined) return null
  try {
    return validate_interest_settings(raw)
  } catch {
    return null
  }
}
