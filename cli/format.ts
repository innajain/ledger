/** Tiny presentation helpers for the CLI. Reuses the app's IST/₹ formatters. */
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { get_indian_date_from_date_obj } from '@/app/_utils/date'

export function money(n: number): string {
  return currency_fmt.format(n)
}

export function fmt_date(d: Date): string {
  return get_indian_date_from_date_obj(d)
}

/** Render an aligned text table. Numeric-looking cells are right-aligned. */
export function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)))
  const isNum = (s: string) => /^-?[\d,]+(\.\d+)?$/.test(s.trim()) || /^[₹]/.test(s.trim())
  const pad = (s: string, w: number, right: boolean) => (right ? s.padStart(w) : s.padEnd(w))
  const line = (cells: string[], rightCol: boolean[]) => cells.map((c, i) => pad(c ?? '', widths[i], rightCol[i])).join('  ')
  const rightCol = headers.map((_, i) => rows.length > 0 && rows.every(r => r[i] === undefined || r[i] === '' || isNum(r[i])))
  const header = line(
    headers,
    headers.map(() => false),
  )
  const sep = widths.map(w => '─'.repeat(w)).join('  ')
  return [header, sep, ...rows.map(r => line(r, rightCol))].join('\n')
}
