import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { normalize_txn } from './normalize_txn'

const D = (n: number) => new Prisma.Decimal(n)
const RUPEES = { id: 'rupees', type: 'rupees' as const, name: 'Rupees' }
const MF = { id: 'mf-fund', type: 'mf' as const, name: 'Some MF' }

function makeTxn(
  items: Array<{
    account_type: 'real' | 'allocation' | 'nominal'
    asset: typeof RUPEES | typeof MF
    quantity: number | null
    txn_value?: number | null
  }>,
) {
  return {
    id: 'txn-1',
    line_items: items.map((li, i) => ({
      id: `li-${i}`,
      account_id: `acc-${li.account_type}`,
      asset_id: li.asset.id,
      account: { type: li.account_type, id: `acc-${li.account_type}` },
      asset: li.asset,
      quantity: li.quantity === null ? null : D(li.quantity),
      txn_value: li.txn_value === undefined ? null : li.txn_value === null ? null : D(li.txn_value),
    })),
  }
}

function n(t: ReturnType<typeof makeTxn>) {
  return normalize_txn(t as unknown as Parameters<typeof normalize_txn>[0])
}

describe('normalize_txn — rupees', () => {
  it('fills the null allocation and nominal qty as -sum(real)', () => {
    const t = n(
      makeTxn([
        { account_type: 'real', asset: RUPEES, quantity: -35 },
        { account_type: 'allocation', asset: RUPEES, quantity: null },
        { account_type: 'nominal', asset: RUPEES, quantity: null },
      ]),
    )
    const alloc = t.line_items.find(li => li.account.type === 'allocation')!
    const nom = t.line_items.find(li => li.account.type === 'nominal')!
    expect(alloc.quantity!.toNumber()).toBe(-35)
    expect(nom.quantity!.toNumber()).toBe(-35)
  })

  it('mirrors quantity into txn_value for rupees', () => {
    const t = n(
      makeTxn([
        { account_type: 'real', asset: RUPEES, quantity: -35 },
        { account_type: 'allocation', asset: RUPEES, quantity: null },
        { account_type: 'nominal', asset: RUPEES, quantity: null },
      ]),
    )
    for (const li of t.line_items) {
      expect(li.txn_value!.toNumber()).toBe(li.quantity!.toNumber())
    }
  })

  it('throws when a real item has null quantity', () => {
    expect(() =>
      n(
        makeTxn([
          { account_type: 'real', asset: RUPEES, quantity: null },
          { account_type: 'allocation', asset: RUPEES, quantity: null },
          { account_type: 'nominal', asset: RUPEES, quantity: null },
        ]),
      ),
    ).toThrow('Real line item with null quantity')
  })

  it('throws when allocation has no null line', () => {
    expect(() =>
      n(
        makeTxn([
          { account_type: 'real', asset: RUPEES, quantity: -35 },
          { account_type: 'allocation', asset: RUPEES, quantity: -35 },
          { account_type: 'nominal', asset: RUPEES, quantity: null },
        ]),
      ),
    ).toThrow('Allocation group with no null quantity')
  })
})

describe('normalize_txn — purity', () => {
  it('does not mutate the input transaction', () => {
    const input = makeTxn([
      { account_type: 'real', asset: RUPEES, quantity: -35 },
      { account_type: 'allocation', asset: RUPEES, quantity: null },
      { account_type: 'nominal', asset: RUPEES, quantity: null },
    ])
    const allocBefore = input.line_items.find(li => li.account.type === 'allocation')!.quantity
    normalize_txn(input as unknown as Parameters<typeof normalize_txn>[0])
    const allocAfter = input.line_items.find(li => li.account.type === 'allocation')!.quantity
    expect(allocBefore).toBeNull()
    expect(allocAfter).toBeNull()
  })
})

describe('normalize_txn — non-rupees (MF)', () => {
  it('fills both qty AND txn_value nulls on allocation and nominal sides', () => {
    const t = n(
      makeTxn([
        { account_type: 'real', asset: MF, quantity: 10, txn_value: 1500 },
        { account_type: 'allocation', asset: MF, quantity: null, txn_value: null },
        { account_type: 'nominal', asset: MF, quantity: null, txn_value: null },
      ]),
    )
    const alloc = t.line_items.find(li => li.account.type === 'allocation')!
    const nom = t.line_items.find(li => li.account.type === 'nominal')!
    expect(alloc.quantity!.toNumber()).toBe(10)
    expect(alloc.txn_value!.toNumber()).toBe(1500)
    expect(nom.quantity!.toNumber()).toBe(10)
    expect(nom.txn_value!.toNumber()).toBe(1500)
  })

  it('throws when nominal has no null txn_value for non-rupees', () => {
    expect(() =>
      n(
        makeTxn([
          { account_type: 'real', asset: MF, quantity: 10, txn_value: 1500 },
          { account_type: 'allocation', asset: MF, quantity: null, txn_value: null },
          { account_type: 'nominal', asset: MF, quantity: null, txn_value: 1500 },
        ]),
      ),
    ).toThrow('Nominal group with no null txn value')
  })
})
