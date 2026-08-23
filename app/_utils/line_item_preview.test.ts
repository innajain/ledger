import { describe, it, expect } from 'vitest'
import { preview_line_items, type PreviewLineInput } from './line_item_preview'

type LineOverrides = Partial<PreviewLineInput>

const line = (head_type: PreviewLineInput['head_type'], quantity: PreviewLineInput['quantity'], overrides: LineOverrides = {}): PreviewLineInput => ({
  accounting_head_id: `head-${head_type}`,
  head_type,
  asset_id: 'inr',
  asset_type: 'rupees',
  quantity,
  txn_value: null,
  ...overrides,
})

describe('preview_line_items', () => {
  it('derives both blank lines of the plain cash expense', () => {
    const res = preview_line_items([
      line('account', '-400', { head_name: 'HDFC Bank' }),
      line('allocation', null, { head_name: 'Spending money' }),
      line('income_expense', null, { head_name: 'Groceries' }),
    ])

    expect(res.problems).toEqual([])
    expect(res.ok).toBe(true)
    expect(res.lines[0]).toMatchObject({ is_blank: false, derived_quantity: null })
    expect(res.lines[1]).toMatchObject({ is_blank: true, derived_quantity: -400, is_zero: false })
    expect(res.lines[2]).toMatchObject({ is_blank: true, derived_quantity: -400, is_zero: false })
  })

  it('accepts numbers as well as strings, and splits across several account lines', () => {
    const res = preview_line_items([
      line('account', -400, { accounting_head_id: 'hdfc' }),
      line('account', -100, { accounting_head_id: 'wallet' }),
      line('allocation', null),
      line('income_expense', null),
    ])

    expect(res.ok).toBe(true)
    expect(res.lines[2].derived_quantity).toBe(-500)
    expect(res.lines[3].derived_quantity).toBe(-500)
  })

  it('flags an account line with no amount and derives nothing', () => {
    const res = preview_line_items([line('account', ''), line('allocation', null), line('income_expense', null)])

    expect(res.ok).toBe(false)
    expect(res.problems).toContain('Add an amount to every account line — 1 is blank.')
    expect(res.lines[0].is_blank).toBe(true)
    expect(res.lines[1].derived_quantity).toBeNull()
    expect(res.lines[2].derived_quantity).toBeNull()
  })

  it('counts several blank account lines', () => {
    const res = preview_line_items([
      line('account', null, { accounting_head_id: 'hdfc' }),
      line('account', null, { accounting_head_id: 'wallet' }),
      line('allocation', null),
      line('income_expense', null),
    ])

    expect(res.problems).toContain('Add an amount to every account line — 2 are blank.')
  })

  it('complains when no allocation line is left blank', () => {
    const res = preview_line_items([
      line('account', '-400'),
      line('allocation', '-300', { accounting_head_id: 'alloc-a' }),
      line('allocation', '-100', { accounting_head_id: 'alloc-b' }),
      line('income_expense', null),
    ])

    expect(res.ok).toBe(false)
    expect(res.problems).toContain('Leave exactly one allocation line blank so the rest is worked out for you — none are blank.')
    expect(res.lines[1].derived_quantity).toBeNull()
    expect(res.lines[2].derived_quantity).toBeNull()
  })

  it('complains when two allocation lines are blank', () => {
    const res = preview_line_items([
      line('account', '-400'),
      line('allocation', null, { accounting_head_id: 'alloc-a' }),
      line('allocation', null, { accounting_head_id: 'alloc-b' }),
      line('income_expense', null),
    ])

    expect(res.problems).toContain('Leave exactly one allocation line blank — 2 are blank.')
    expect(res.lines[1].derived_quantity).toBeNull()
    expect(res.lines[2].derived_quantity).toBeNull()
  })

  it('applies the same one-blank rule to income/expense lines', () => {
    const res = preview_line_items([
      line('account', '-400'),
      line('allocation', null),
      line('income_expense', '-300', { accounting_head_id: 'ie-a' }),
      line('income_expense', '-100', { accounting_head_id: 'ie-b' }),
    ])

    expect(res.problems).toContain('Leave exactly one income/expense line blank so the rest is worked out for you — none are blank.')
  })

  it('accepts a transfer whose account lines cancel out', () => {
    const res = preview_line_items([line('account', '-400', { accounting_head_id: 'hdfc' }), line('account', '400', { accounting_head_id: 'icici' })])

    expect(res.ok).toBe(true)
    expect(res.problems).toEqual([])
  })

  it('requires account lines to cancel out when there is no allocation line', () => {
    const res = preview_line_items([line('account', '-400', { accounting_head_id: 'hdfc' }), line('income_expense', null)])

    expect(res.ok).toBe(false)
    expect(res.problems).toContain(
      'Account amounts must add up to zero unless the transaction has both an allocation line and an income/expense line — they add up to -400.',
    )
  })

  it('requires account lines to cancel out when there is no income/expense line', () => {
    const res = preview_line_items([line('account', '250', { accounting_head_id: 'hdfc' }), line('allocation', null)])

    expect(res.problems).toContain(
      'Account amounts must add up to zero unless the transaction has both an allocation line and an income/expense line — they add up to 250.',
    )
  })

  it('does not report an imbalance caused by float noise', () => {
    const res = preview_line_items([
      line('account', '0.1', { accounting_head_id: 'a' }),
      line('account', '0.2', { accounting_head_id: 'b' }),
      line('account', '-0.3', { accounting_head_id: 'c' }),
    ])

    expect(res.ok).toBe(true)
  })

  it('does not report an imbalance on large amounts, where one float ulp exceeds the epsilon', () => {
    // exact in decimal, but the raw float sum lands on 3.7e-9
    const res = preview_line_items([
      line('account', '-9810802.54', { accounting_head_id: 'hdfc' }),
      line('account', '-7395495.13', { accounting_head_id: 'icici' }),
      line('account', '17206297.67', { accounting_head_id: 'kotak' }),
    ])

    expect(res.problems).toEqual([])
    expect(res.ok).toBe(true)
  })

  it('still reports a genuine one-paisa imbalance', () => {
    const res = preview_line_items([
      line('account', '-9810802.54', { accounting_head_id: 'hdfc' }),
      line('account', '9810802.5401', { accounting_head_id: 'icici' }),
    ])

    expect(res.ok).toBe(false)
    expect(res.problems).toContain(
      'Account amounts must add up to zero unless the transaction has both an allocation line and an income/expense line — they add up to 0.0001.',
    )
  })

  it('flags a derived line that comes out as zero', () => {
    const res = preview_line_items([
      line('account', '400', { accounting_head_id: 'hdfc' }),
      line('account', '-400', { accounting_head_id: 'icici' }),
      line('allocation', null, { head_name: 'Spending money' }),
      line('income_expense', null, { head_name: 'Groceries' }),
    ])

    expect(res.ok).toBe(false)
    expect(res.problems).toContain('“Spending money” comes out as zero — drop the line or change the amounts.')
    expect(res.problems).toContain('“Groceries” comes out as zero — drop the line or change the amounts.')
    expect(res.lines[2]).toMatchObject({ derived_quantity: 0, is_zero: true })
    expect(res.lines[3]).toMatchObject({ derived_quantity: 0, is_zero: true })
  })

  it('flags an amount typed as zero', () => {
    const res = preview_line_items([line('account', '0', { head_name: 'HDFC Bank' }), line('allocation', null), line('income_expense', null)])

    expect(res.problems).toContain('“HDFC Bank” comes out as zero — drop the line or change the amounts.')
    expect(res.lines[0].is_zero).toBe(true)
  })

  it('handles a non-rupee asset, deriving both the units and the rupee value', () => {
    const mf = { asset_id: 'nifty50', asset_type: 'mf', asset_name: 'Nifty 50 Index Fund' }
    const res = preview_line_items([
      line('account', '12.5', { ...mf, txn_value: '1000', accounting_head_id: 'folio' }),
      line('allocation', null, { ...mf, txn_value: null }),
      line('income_expense', null, { ...mf, txn_value: null }),
    ])

    expect(res.ok).toBe(true)
    expect(res.lines[1]).toMatchObject({ derived_quantity: 12.5, derived_txn_value: 1000 })
    expect(res.lines[2]).toMatchObject({ derived_quantity: 12.5, derived_txn_value: 1000 })
  })

  it('asks for a rupee value on every account line of a non-rupee asset', () => {
    const mf = { asset_id: 'nifty50', asset_type: 'mf', asset_name: 'Nifty 50 Index Fund' }
    const res = preview_line_items([
      line('account', '12.5', { ...mf, txn_value: null, accounting_head_id: 'folio' }),
      line('allocation', null, { ...mf, txn_value: null }),
      line('income_expense', null, { ...mf, txn_value: null }),
    ])

    expect(res.problems).toContain('Add a ₹ value to every account line — 1 is blank.')
    expect(res.lines[1].derived_txn_value).toBeNull()
  })

  it('wants exactly one non-rupee line without a rupee value', () => {
    const mf = { asset_id: 'nifty50', asset_type: 'mf', asset_name: 'Nifty 50 Index Fund' }
    const res = preview_line_items([
      line('account', '12.5', { ...mf, txn_value: '1000', accounting_head_id: 'folio' }),
      line('allocation', null, { ...mf, txn_value: '1000' }),
      line('income_expense', null, { ...mf, txn_value: null }),
    ])

    expect(res.problems).toContain('Leave exactly one allocation line without a ₹ value — none are blank.')
  })

  it('rejects a rupee line carrying a separate value', () => {
    const res = preview_line_items([line('account', '-400', { txn_value: '-400' }), line('allocation', null), line('income_expense', null)])

    expect(res.problems).toContain('Rupee lines carry no separate value — clear the Txn Value field.')
  })

  it('keeps the asset groups apart and names the asset when several are involved', () => {
    const mf = { asset_id: 'nifty50', asset_type: 'mf', asset_name: 'Nifty 50 Index Fund' }
    const res = preview_line_items([
      // rupee side: money leaves the bank
      line('account', '-1000', { asset_name: 'Rupees', accounting_head_id: 'hdfc' }),
      line('allocation', null, { asset_name: 'Rupees' }),
      line('income_expense', null, { asset_name: 'Rupees' }),
      // fund side: units arrive
      line('account', '12.5', { ...mf, txn_value: '1000', accounting_head_id: 'folio' }),
      line('allocation', null, { ...mf, accounting_head_id: 'alloc-mf' }),
      line('income_expense', null, { ...mf, accounting_head_id: 'ie-mf' }),
    ])

    expect(res.ok).toBe(true)
    expect(res.lines[1].derived_quantity).toBe(-1000)
    expect(res.lines[4]).toMatchObject({ derived_quantity: 12.5, derived_txn_value: 1000 })

    const broken = preview_line_items([
      line('account', '-1000', { asset_name: 'Rupees', accounting_head_id: 'hdfc' }),
      line('allocation', null, { asset_name: 'Rupees' }),
      line('income_expense', null, { asset_name: 'Rupees' }),
      line('account', null, { ...mf, txn_value: '1000', accounting_head_id: 'folio' }),
      line('allocation', null, { ...mf, accounting_head_id: 'alloc-mf' }),
      line('income_expense', null, { ...mf, accounting_head_id: 'ie-mf' }),
    ])

    expect(broken.problems).toContain('Add an amount to every account line for Nifty 50 Index Fund — 1 is blank.')
    // the rupee group is untouched by the fund group's problem
    expect(broken.lines[1].derived_quantity).toBe(-1000)
  })

  it('asks for an account and an asset on every line', () => {
    const res = preview_line_items([line('account', '-400', { accounting_head_id: '' }), line('allocation', null), line('income_expense', null)])

    expect(res.problems).toContain('Pick an account and an asset on every line.')
  })

  it('reports an empty form rather than calling it balanced', () => {
    const res = preview_line_items([])
    expect(res).toEqual({ ok: false, problems: ['Add at least one line item.'], lines: [] })
  })

  it('ignores a half-typed amount instead of treating it as a number', () => {
    const res = preview_line_items([line('account', '-'), line('allocation', null), line('income_expense', null)])

    expect(res.lines[0].is_blank).toBe(true)
    expect(res.problems).toContain('Add an amount to every account line — 1 is blank.')
  })

  it('rounds derived amounts to the stored precision', () => {
    const res = preview_line_items([
      line('account', '-100.005', { accounting_head_id: 'hdfc' }),
      line('allocation', '-33.335', { accounting_head_id: 'alloc-a' }),
      line('allocation', null, { accounting_head_id: 'alloc-b' }),
      line('income_expense', null),
    ])

    expect(res.lines[2].derived_quantity).toBe(-66.67)
  })
})
