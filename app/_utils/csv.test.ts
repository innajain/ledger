import { describe, it, expect } from 'vitest'
import { csv_cell, to_csv, formula_guard, cell_text } from './csv'

describe('csv_cell', () => {
  it('passes simple values through unquoted', () => {
    expect(csv_cell('hello')).toBe('hello')
    expect(csv_cell(42)).toBe('42')
    expect(csv_cell(-3.5)).toBe('-3.5')
  })

  it('renders null/undefined as an empty cell', () => {
    expect(csv_cell(null)).toBe('')
    expect(csv_cell(undefined)).toBe('')
  })

  it('quotes and escapes values with commas, quotes, or newlines', () => {
    expect(csv_cell('a,b')).toBe('"a,b"')
    expect(csv_cell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csv_cell('line1\nline2')).toBe('"line1\nline2"')
    expect(csv_cell('has\rcr')).toBe('"has\rcr"')
  })
})

describe('formula_guard', () => {
  it('prefixes cells that begin with a formula trigger', () => {
    expect(formula_guard('=1+1')).toBe("'=1+1")
    expect(formula_guard('+1')).toBe("'+1")
    expect(formula_guard('-cmd|calc')).toBe("'-cmd|calc")
    expect(formula_guard('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(formula_guard('\tTAB')).toBe("'\tTAB")
  })

  it('leaves ordinary text untouched', () => {
    expect(formula_guard('hello')).toBe('hello')
    expect(formula_guard('a=b')).toBe('a=b')
    expect(formula_guard('')).toBe('')
  })
})

describe('to_csv', () => {
  it('joins header and rows with CRLF and a trailing newline', () => {
    const out = to_csv(
      ['a', 'b'],
      [
        ['1', '2'],
        ['3', '4'],
      ],
    )
    expect(out).toBe('a,b\r\n1,2\r\n3,4\r\n')
  })

  it('escapes cells inside rows and blanks out nullish values', () => {
    const out = to_csv(['name', 'note'], [['Café, Inc', null]])
    expect(out).toBe('name,note\r\n"Café, Inc",\r\n')
  })

  it('emits only the header row when there are no data rows', () => {
    expect(to_csv(['x', 'y'], [])).toBe('x,y\r\n')
  })
})

describe('cell_text', () => {
  it('renders null, dates and plain values', () => {
    expect(cell_text(null)).toBe('')
    expect(cell_text(undefined)).toBe('')
    expect(cell_text(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z')
    expect(cell_text(42)).toBe('42')
    expect(cell_text(true)).toBe('true')
    expect(cell_text('abc')).toBe('abc')
  })

  it('renders a json column value as JSON, never "[object Object]"', () => {
    expect(cell_text({ slabs: [{ up_to: null, rate_pct: 2.5 }] })).toBe('{"slabs":[{"up_to":null,"rate_pct":2.5}]}')
    expect(cell_text([1, 2])).toBe('[1,2]')
  })

  it('survives a round trip through a CSV cell', () => {
    const text = cell_text({ note: 'a "quoted", comma' })
    expect(csv_cell(text)).toBe('"{""note"":""a \\""quoted\\"", comma""}"')
  })
})
