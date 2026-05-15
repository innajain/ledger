import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { validate_line_items } from './validate_line_items'

type LineItemShape = {
  account: { type: 'real' | 'allocation' | 'nominal' }
  asset: { id: string; type: 'rupees' | 'mf' | 'etf' | 'shares' | 'other'; name: string }
  quantity: Prisma.Decimal | null
  book_value: Prisma.Decimal | null
}

const D = (n: number) => new Prisma.Decimal(n)
const RUPEES = { id: 'rupees', type: 'rupees' as const, name: 'Rupees' }
const MF = { id: 'mf-fund', type: 'mf' as const, name: 'Some MF' }

function li(
  account_type: 'real' | 'allocation' | 'nominal',
  asset: typeof RUPEES | typeof MF,
  quantity: number | null,
  book_value: number | null = null,
): LineItemShape {
  return {
    account: { type: account_type },
    asset,
    quantity: quantity === null ? null : D(quantity),
    book_value: book_value === null ? null : D(book_value),
  }
}

function check(items: LineItemShape[]) {
  // Cast through unknown — the Prisma payload type is over-precise for tests.
  return validate_line_items(items as unknown as Parameters<typeof validate_line_items>[0])
}

describe('validate_line_items — rupees', () => {
  it('accepts a simple expense with one null in allocation and nominal', () => {
    const result = check([li('real', RUPEES, -35), li('allocation', RUPEES, null), li('nominal', RUPEES, null)])
    expect(result.is_valid).toBe(true)
  })

  it('rejects a real line item with null quantity', () => {
    const result = check([li('real', RUPEES, null), li('allocation', RUPEES, null), li('nominal', RUPEES, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('null quantity')
  })

  it('rejects allocation with zero null quantities', () => {
    const result = check([li('real', RUPEES, -35), li('allocation', RUPEES, -35), li('nominal', RUPEES, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('exactly one line item with null quantity in allocation')
  })

  it('rejects allocation with two null quantities', () => {
    const result = check([li('real', RUPEES, -35), li('allocation', RUPEES, null), li('allocation', RUPEES, null), li('nominal', RUPEES, null)])
    expect(result.is_valid).toBe(false)
  })

  it('rejects rupees line items with non-null book_value', () => {
    const result = check([li('real', RUPEES, -35, -35), li('allocation', RUPEES, null), li('nominal', RUPEES, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('rupees asset should not have book value')
  })

  it('requires real qty sum = 0 when no allocation/nominal', () => {
    const result = check([li('real', RUPEES, -35), li('real', RUPEES, 30)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('should be zero')
  })

  it('accepts real-only when sum is zero', () => {
    const result = check([li('real', RUPEES, -35), li('real', RUPEES, 35)])
    expect(result.is_valid).toBe(true)
  })
})

describe('validate_line_items — non-rupees (MF)', () => {
  it('accepts a simple buy with explicit book_value on real and one null in each side', () => {
    const result = check([li('real', MF, 10, 1500), li('allocation', MF, null, null), li('nominal', MF, null, null)])
    expect(result.is_valid).toBe(true)
  })

  it('rejects a non-rupees real item with null book_value', () => {
    const result = check([li('real', MF, 10, null), li('allocation', MF, null, null), li('nominal', MF, null, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('null book value')
  })

  it('requires exactly one null book_value on the allocation side', () => {
    const result = check([li('real', MF, 10, 1500), li('allocation', MF, null, 1500), li('nominal', MF, null, null)])
    expect(result.is_valid).toBe(false)
    expect(result.message).toContain('exactly one line item with null book value in allocation')
  })
})
