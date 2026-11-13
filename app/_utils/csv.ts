export type CsvValue = string | number | null | undefined

// A database value as the text a CSV or spreadsheet cell holds: dates as ISO instants, a
// json/jsonb value (a parsed object or array) as JSON — String(v) would give "[object
// Object]" — and everything else as its plain string.
export function cell_text(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function csv_cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/

export function formula_guard(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value
}

export function to_csv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csv_cell).join(',')]
  for (const row of rows) lines.push(row.map(csv_cell).join(','))
  return lines.join('\r\n') + '\r\n'
}
