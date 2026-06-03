import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { validate_line_items } from './validate_line_items'

type LineItemShape = {
  accounting_head: { type: 'account' | 'allocation' | 'income_expense' }
  asset: { id: string; type: 'rupees' | 'mf' | 'etf' | 'shares' | 'other'; name: string }
  quantity: Prisma.Decimal | null
  txn_value: Prisma.Decimal | null
}

const D = (n: number) => new Prisma.Decimal(n)
const RUPEES = { id: 'rupees', type: 'rupees' as const, name: 'Rupees' }
const MF = { id: 'mf-fund', type: 'mf' as const, name: 'Some MF' }

function li(
  accounting_head_type: 'account' | 'allocation' | 'income_expense',
  asset: typeof RUPEES | typeof MF,
  quantity: number | null,
  txn_value: number | null = null,
): LineItemShape {
  return {
    accounting_head: { type: accounting_head_type },
    asset,
    quantity: quantity === null ? null : D(quantity),
    txn_value: txn_value === null ? null : D(txn_value),
  }
}

function check(items: LineItemShape[]) {
  // Cast through unknown — the Prisma payload type is over-precise for tests.
  return validate_line_items(items as unknown as Parameters<typeof validate_line_items>[0])
}

describe('validate_line_items — rupees', () => {
  it('accepts a simple expense with one null in allocation and income/expense', () => {
    const result = check([li('account', RUPEES, -35), li('allocation', RUPEES, null), li('income_expense', RUPEES, null)])
    expect(result.is_valid).toBe(true)
  })

  it('rejects an account line item with null quantity', () => {
    const result = check([li('account', RUPEES, null), li('allocation', RUPEES, null), li('income_expense', RUPEES, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('null quantity')
  })

  it('rejects allocation with zero null quantities', () => {
    const result = check([li('account', RUPEES, -35), li('allocation', RUPEES, -35), li('income_expense', RUPEES, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('exactly one line item with null quantity in allocation')
  })

  it('rejects allocation with two null quantities', () => {
    const result = check([
      li('account', RUPEES, -35),
      li('allocation', RUPEES, null),
      li('allocation', RUPEES, null),
      li('income_expense', RUPEES, null),
    ])
    expect(result.is_valid).toBe(false)
  })

  it('rejects rupees line items with non-null txn_value', () => {
    const result = check([li('account', RUPEES, -35, -35), li('allocation', RUPEES, null), li('income_expense', RUPEES, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('rupees asset should not have txn value')
  })

  it('requires account qty sum = 0 when no allocation/income-expense', () => {
    const result = check([li('account', RUPEES, -35), li('account', RUPEES, 30)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('should be zero')
  })

  it('accepts account-only when sum is zero', () => {
    const result = check([li('account', RUPEES, -35), li('account', RUPEES, 35)])
    expect(result.is_valid).toBe(true)
  })
})

describe('validate_line_items — non-rupees (MF)', () => {
  it('accepts a simple buy with explicit txn_value on account and one null in each side', () => {
    const result = check([li('account', MF, 10, 1500), li('allocation', MF, null, null), li('income_expense', MF, null, null)])
    expect(result.is_valid).toBe(true)
  })

  it('rejects a non-rupees account item with null txn_value', () => {
    const result = check([li('account', MF, 10, null), li('allocation', MF, null, null), li('income_expense', MF, null, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('null txn value')
  })

  it('requires exactly one null txn_value on the allocation side', () => {
    const result = check([li('account', MF, 10, 1500), li('allocation', MF, null, 1500), li('income_expense', MF, null, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('exactly one line item with null txn value in allocation')
  })
})
