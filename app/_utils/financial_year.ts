import { ist_ymd, ist_midnight } from '@/app/_utils/ist_date'

// FY window: 1 Apr IST 00:00 (inclusive) → 1 Apr IST 00:00 of next year (exclusive).
// fy_start_year = 2026 means FY 2026-27.
export function financial_year_window(fy_start_year: number): { from: Date; to: Date } {
  return {
    from: ist_midnight(`${fy_start_year}-04-01`),
    to: ist_midnight(`${fy_start_year + 1}-04-01`),
  }
}

// The FY in which `now` falls.
export function current_financial_year(now: Date): number {
  const ymd = ist_ymd(now)
  const month = parseInt(ymd.slice(5, 7), 10)
  const year = parseInt(ymd.slice(0, 4), 10)
  return month >= 4 ? year : year - 1
}

// Human-readable label, e.g. "FY 2026-27".
export function fy_label(fy_start_year: number): string {
  return `FY ${fy_start_year}-${String(fy_start_year + 1).slice(2)}`
}

// Accepts "2026" or "2026-27" (also "2026-27" where the trailing year is the
// two-digit form). Returns the FY start year, or null for unparseable input.
export function parse_fy(ref: string): number | null {
  const m = ref.trim().match(/^(\d{4})(?:-(\d{2}))?$/)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = m[2] ? parseInt(m[2], 10) : null
  if (end !== null && end !== (start + 1) % 100) return null
  return start
}
