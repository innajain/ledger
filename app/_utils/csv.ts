// Pure CSV helpers (RFC 4180). A cell is quoted only when it contains a comma,
// double quote, CR or LF; embedded quotes are doubled. Rows are joined with
// CRLF and the output ends with a trailing CRLF, which spreadsheet apps expect.

export type CsvValue = string | number | null | undefined

export function csv_cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Spreadsheet formula-injection guard. Excel/Sheets evaluate a cell that begins
// with = + - @ (or a tab/CR) as a formula, so untrusted text — e.g. a transaction
// description shared by another user — could run =HYPERLINK(...) or a worse payload
// when the exported CSV is opened. Prefix such values with an apostrophe so they
// render as plain text. Apply only to textual columns: numeric cells legitimately
// start with '-'.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/

export function formula_guard(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value
}

export function to_csv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csv_cell).join(',')]
  for (const row of rows) lines.push(row.map(csv_cell).join(','))
  return lines.join('\r\n') + '\r\n'
}
