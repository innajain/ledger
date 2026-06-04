// Pure CSV helpers (RFC 4180). A cell is quoted only when it contains a comma,
// double quote, CR or LF; embedded quotes are doubled. Rows are joined with
// CRLF and the output ends with a trailing CRLF, which spreadsheet apps expect.

export type CsvValue = string | number | null | undefined

export function csv_cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function to_csv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csv_cell).join(',')]
  for (const row of rows) lines.push(row.map(csv_cell).join(','))
  return lines.join('\r\n') + '\r\n'
}
