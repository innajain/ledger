import { describe, it, expect } from 'vitest'
import { parse_statement, parse_statement_amount, parse_statement_date } from './statement_parser'

describe('parse_statement_date', () => {
  it('reads dd-MM-yyyy, dd/MM/yyyy, yyyy-MM-dd and dd MMM yyyy', () => {
    expect(parse_statement_date('05-08-2026')).toBe('2026-08-05')
    expect(parse_statement_date('5/8/2026')).toBe('2026-08-05')
    expect(parse_statement_date('2026-08-05')).toBe('2026-08-05')
    expect(parse_statement_date('05 Aug 2026')).toBe('2026-08-05')
    expect(parse_statement_date('05-08-26')).toBe('2026-08-05')
    expect(parse_statement_date('not a date')).toBeNull()
  })
})

describe('parse_statement_amount', () => {
  it('handles signs, rupee symbols, commas, parentheses and Cr/Dr markers', () => {
    expect(parse_statement_amount('-6,800.00')).toBe(-6800)
    expect(parse_statement_amount('₹1,234.56')).toBe(1234.56)
    expect(parse_statement_amount('(500)')).toBe(-500)
    expect(parse_statement_amount('1,200.00 Cr')).toBe(1200)
    expect(parse_statement_amount('1,200.00 Dr')).toBe(-1200)
    expect(parse_statement_amount('')).toBeNull()
    expect(parse_statement_amount('abc')).toBeNull()
  })
})

describe('parse_statement', () => {
  it('parses headerless positional CSV: date, amount, ref, desc', () => {
    const { rows, errors } = parse_statement('01-08-2026,-6800,UPI-621663575718,Rent payment\n02-08-2026,150.5,,Chai')
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { index: 0, date: '2026-08-01', amount: -6800, ref: 'UPI-621663575718', desc: 'Rent payment' },
      { index: 1, date: '2026-08-02', amount: 150.5, ref: null, desc: 'Chai' },
    ])
  })

  it('maps header columns by name, including separate debit/credit columns', () => {
    const text = [
      'Date,Narration,UTR Number,Withdrawal Amt,Deposit Amt',
      '01/08/2026,SALARY AUG,NEFT123,,85000.00',
      '03/08/2026,SWIGGY ORDER,UPI-999,432.50,',
    ].join('\n')
    const { rows, errors } = parse_statement(text)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ date: '2026-08-01', amount: 85000, ref: 'NEFT123', desc: 'SALARY AUG' })
    expect(rows[1]).toMatchObject({ date: '2026-08-03', amount: -432.5, ref: 'UPI-999', desc: 'SWIGGY ORDER' })
  })

  it('parses tab-separated input', () => {
    const { rows, errors } = parse_statement('01-08-2026\t-100\tREF1\tAuto\n02-08-2026\t250\t\t')
    expect(errors).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0].ref).toBe('REF1')
    expect(rows[1]).toMatchObject({ amount: 250, ref: null, desc: null })
  })

  it('handles quoted CSV cells with embedded commas', () => {
    const { rows } = parse_statement('Date,Amount,Ref,Description\n01-08-2026,-99,,"AMAZON, order 123"')
    expect(rows[0].desc).toBe('AMAZON, order 123')
  })

  it('reports unparseable lines without dropping the good ones', () => {
    const { rows, errors } = parse_statement('01-08-2026,-100\ngarbage line\n02-08-2026,zero-amount-missing')
    expect(rows).toHaveLength(1)
    expect(errors).toHaveLength(2)
  })
})
