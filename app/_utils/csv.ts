export type CsvValue = string | number | null | undefined

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
