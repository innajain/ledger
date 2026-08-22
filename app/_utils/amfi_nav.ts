// Pure parser for AMFI's NAVAll.txt feed. The file is semicolon-separated with a
// header row and free-text section headings interleaved between data rows.
//
// AMFI changed the layout in 2026, inserting "Plan" and "Option" columns before
// the NAV/date pair (6 columns -> 8). Column positions are therefore resolved
// from the header when it is present, and otherwise taken from the end of the
// row (NAV and date have always been the last two fields) so that a future
// column insertion degrades instead of breaking.

export const AMFI_NAVALL_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt'

export type AmfiNavRow = {
  scheme_code: string
  isin_growth: string | null
  isin_reinvestment: string | null
  scheme_name: string
  nav: number
  date: string // dd-MMM-yyyy, verbatim from the feed
}

export type AmfiNavParseOutcome = {
  rows: AmfiNavRow[]
  skipped: number // data-looking rows dropped as malformed
}

const DATE_RE = /^\d{1,2}-[A-Za-z]{3}-\d{4}$/

function cell(parts: string[], index: number): string {
  return (parts[index] ?? '').trim()
}

function find_header_indices(parts: string[]): { nav: number; date: number } | null {
  const cols = parts.map(p => p.trim().toLowerCase())
  const nav = cols.findIndex(c => c.includes('net asset value'))
  const date = cols.findIndex(c => c === 'date')
  return nav >= 0 && date >= 0 ? { nav, date } : null
}

export function parse_navall(text: string): AmfiNavParseOutcome {
  const rows: AmfiNavRow[] = []
  let skipped = 0
  let headerIndices: { nav: number; date: number } | null = null

  for (const line of text.split('\n')) {
    const parts = line.split(';')
    if (parts.length < 6) continue

    if (!headerIndices) headerIndices = find_header_indices(parts)

    const scheme_code = cell(parts, 0)
    // Data rows lead with a numeric scheme code; the header and section
    // headings do not.
    if (!scheme_code || !/^\d+$/.test(scheme_code)) continue

    const navIndex = headerIndices?.nav ?? parts.length - 2
    const dateIndex = headerIndices?.date ?? parts.length - 1

    const navStr = cell(parts, navIndex)
    const date = cell(parts, dateIndex)
    const nav = Number(navStr)

    if (!navStr || !Number.isFinite(nav) || !DATE_RE.test(date)) {
      skipped++
      continue
    }

    const isin_growth = cell(parts, 1)
    const isin_reinvestment = cell(parts, 2)

    rows.push({
      scheme_code,
      isin_growth: isin_growth && isin_growth !== '-' ? isin_growth : null,
      isin_reinvestment: isin_reinvestment && isin_reinvestment !== '-' ? isin_reinvestment : null,
      scheme_name: cell(parts, 3),
      nav,
      date,
    })
  }

  return { rows, skipped }
}
