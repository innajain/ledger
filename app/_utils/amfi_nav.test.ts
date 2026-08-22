import { describe, it, expect } from 'vitest'
import { parse_navall } from './amfi_nav'

// Layout AMFI switched to in 2026: "Plan" and "Option" inserted before NAV/date.
const NEW_HEADER = 'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date'
const OLD_HEADER = 'Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date'

describe('parse_navall', () => {
  it('parses the current 8-column layout', () => {
    const text = [
      NEW_HEADER,
      ' ',
      'Open Ended Schemes(Equity Scheme - Flexi Cap Fund)',
      ' ',
      'PPFAS Mutual Fund',
      ' ',
      '122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;90.8656;21-Aug-2026',
    ].join('\n')

    const { rows, skipped } = parse_navall(text)
    expect(skipped).toBe(0)
    expect(rows).toEqual([
      {
        scheme_code: '122639',
        isin_growth: 'INF879O01027',
        isin_reinvestment: null,
        scheme_name: 'Parag Parikh Flexi Cap Fund',
        nav: 90.8656,
        date: '21-Aug-2026',
      },
    ])
  })

  it('parses the legacy 6-column layout', () => {
    const text = [OLD_HEADER, '122639;INF879O01027;INF879O01035;Parag Parikh Flexi Cap Fund;90.8656;21-Aug-2026'].join('\n')

    const { rows } = parse_navall(text)
    expect(rows).toHaveLength(1)
    expect(rows[0].nav).toBe(90.8656)
    expect(rows[0].date).toBe('21-Aug-2026')
    expect(rows[0].isin_reinvestment).toBe('INF879O01035')
  })

  it('falls back to the trailing columns when the header is absent', () => {
    const text = '119551;INF209KA12Z1;INF209KA13Z9;Some Fund;Direct Plan;IDCW;106.8821;21-Aug-2026'
    const { rows } = parse_navall(text)
    expect(rows).toHaveLength(1)
    expect(rows[0].nav).toBe(106.8821)
  })

  it('tolerates CRLF line endings', () => {
    const text = `${NEW_HEADER}\r\n122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;90.8656;21-Aug-2026\r\n`
    const { rows } = parse_navall(text)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('21-Aug-2026')
  })

  it('skips malformed data rows instead of throwing', () => {
    const text = [
      NEW_HEADER,
      '122639;INF879O01027;-;Good Fund;Direct Plan;Growth;90.8656;21-Aug-2026',
      '122640;INF879O01028;-;No NAV Fund;Direct Plan;Growth;N.A.;21-Aug-2026',
      '122641;INF879O01029;-;Bad Date Fund;Direct Plan;Growth;12.34;not-a-date',
      '122642;INF879O01030;-;Blank NAV Fund;Direct Plan;Growth;;21-Aug-2026',
    ].join('\n')

    const { rows, skipped } = parse_navall(text)
    expect(rows.map(r => r.scheme_name)).toEqual(['Good Fund'])
    expect(skipped).toBe(3)
  })

  it('ignores headers, section headings and blank lines', () => {
    const text = [NEW_HEADER, '', ' ', 'Open Ended Schemes(Debt Scheme)', 'Aditya Birla Sun Life Mutual Fund'].join('\n')
    expect(parse_navall(text)).toEqual({ rows: [], skipped: 0 })
  })
})
