// Pure parser for pasted/uploaded bank-statement text → normalized rows for
// reconciliation. Handles CSV and TSV, optional header row (columns matched by
// name), Indian date/amount formats, and separate debit/credit columns.

export type ParsedStatementRow = {
  index: number
  date: string // yyyy-MM-dd
  amount: number // signed, negative = money out
  ref: string | null
  desc: string | null
}

export type ParseOutcome = { rows: ParsedStatementRow[]; errors: string[] }

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function parse_statement_date(cell: string): string | null {
  const s = cell.trim().replace(/,/g, '')
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${pad(+m[2])}-${pad(+m[1])}`
  }
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{2,4})$/)
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (!month) return null
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${pad(month)}-${pad(+m[1])}`
  }
  return null
}

export function parse_statement_amount(cell: string): number | null {
  let s = cell.trim()
  if (s === '' || s === '-' || s === '—') return null
  let sign = 1
  if (/^\(.*\)$/.test(s)) {
    sign = -1
    s = s.slice(1, -1)
  }
  const marker = s.match(/\b(cr|dr)\.?$/i)
  if (marker) {
    if (marker[1].toLowerCase() === 'dr') sign *= -1
    s = s.slice(0, marker.index).trim()
  }
  s = s.replace(/[₹,\s]/g, '').replace(/^(rs\.?|inr)/i, '')
  if (s.startsWith('-')) {
    sign *= -1
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return sign * Number(s)
}

function split_line(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let in_quotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (in_quotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        in_quotes = false
      } else {
        current += ch
      }
    } else if (ch === '"' && current.trim() === '') {
      in_quotes = true
      current = ''
    } else if (ch === delimiter) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

type ColumnMap = { date: number; amount: number | null; debit: number | null; credit: number | null; ref: number | null; desc: number | null }

function map_header(cells: string[]): ColumnMap | null {
  const lower = cells.map(c => c.toLowerCase())
  const find = (re: RegExp) => {
    const i = lower.findIndex(c => re.test(c))
    return i === -1 ? null : i
  }
  const date = find(/date/)
  if (date === null) return null
  const debit = find(/debit|withdrawal|\bdr\b/)
  const credit = find(/credit|deposit|\bcr\b/)
  const amount = find(/^amount|amount\b|\bvalue\b/)
  if (amount === null && debit === null && credit === null) return null
  return {
    date,
    amount,
    debit,
    credit,
    ref: find(/ref|utr|txn.?id|transaction id|cheque/),
    desc: find(/desc|narration|particular|remark|detail/),
  }
}

export function parse_statement(text: string): ParseOutcome {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '')
  if (lines.length === 0) return { rows: [], errors: ['Nothing to parse'] }

  const delimiter = lines.some(l => l.includes('\t')) ? '\t' : ','

  const first_cells = split_line(lines[0], delimiter)
  const header = parse_statement_date(first_cells[0] ?? '') === null ? map_header(first_cells) : null
  const data_lines = header ? lines.slice(1) : lines

  const rows: ParsedStatementRow[] = []
  const errors: string[] = []

  data_lines.forEach((line, i) => {
    const line_no = header ? i + 2 : i + 1
    const cells = split_line(line, delimiter)
    let date: string | null
    let amount: number | null
    let ref: string | null = null
    let desc: string | null = null

    if (header) {
      date = parse_statement_date(cells[header.date] ?? '')
      if (header.debit !== null || header.credit !== null) {
        const debit = header.debit !== null ? parse_statement_amount(cells[header.debit] ?? '') : null
        const credit = header.credit !== null ? parse_statement_amount(cells[header.credit] ?? '') : null
        amount = debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0)
        if (amount === null && header.amount !== null) amount = parse_statement_amount(cells[header.amount] ?? '')
      } else {
        amount = parse_statement_amount(cells[header.amount!] ?? '')
      }
      if (header.ref !== null) ref = cells[header.ref] || null
      if (header.desc !== null) desc = cells[header.desc] || null
    } else {
      date = parse_statement_date(cells[0] ?? '')
      amount = parse_statement_amount(cells[1] ?? '')
      ref = cells[2] || null
      desc = cells.slice(3).filter(Boolean).join(' ') || null
    }

    if (date === null) {
      errors.push(`Line ${line_no}: could not read a date from "${line.slice(0, 60)}"`)
      return
    }
    if (amount === null || amount === 0) {
      errors.push(`Line ${line_no}: could not read a non-zero amount from "${line.slice(0, 60)}"`)
      return
    }
    rows.push({ index: rows.length, date, amount: Math.round(amount * 100) / 100, ref: ref?.trim() || null, desc: desc?.trim() || null })
  })

  return { rows, errors }
}
