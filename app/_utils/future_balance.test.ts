import { describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { compute_future_sufficiency } from './future_balance'

const dec = (n: number | string) => new Prisma.Decimal(n)
const balances = (entries: [string, number | string][]) => new Map(entries.map(([k, v]) => [k, dec(v)] as const))

function line(
  id: string,
  transaction_id: string,
  datetime: Date,
  asset_id: string,
  quantity: number | string,
  txn_value: number | string,
  description?: string,
) {
  return { id, transaction_id, datetime, description: description ?? null, asset_id, quantity: dec(quantity), txn_value: dec(txn_value) }
}

const NOW = new Date('2026-10-01T00:00:00Z')

describe('compute_future_sufficiency', () => {
  it('marks a single sufficient outflow as sufficient', () => {
    const rows = compute_future_sufficiency(balances([['a', 500]]), [line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'a', -200, -200)], NOW)
    expect(rows[0].sufficient).toBe(true)
    expect(rows[0].amount).toBe(-200)
    expect(rows[0].balance_after).toBe(300)
  })

  it('marks a single insufficient outflow as insufficient', () => {
    const rows = compute_future_sufficiency(balances([['a', 500]]), [line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'a', -600, -600)], NOW)
    expect(rows[0].sufficient).toBe(false)
    expect(rows[0].balance_after).toBe(-100)
  })

  it('makes a later outflow sufficient once an earlier inflow lands', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 100]]),
      [
        line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'a', 500, 500),
        line('li2', 't2', new Date('2026-10-10T00:00:00Z'), 'a', -400, -400),
        line('li3', 't3', new Date('2026-10-15T00:00:00Z'), 'a', -400, -400),
      ],
      NOW,
    )
    expect(rows.map(r => r.sufficient)).toEqual([true, true, false])
  })

  it('gives two line items on the same transaction/asset — e.g. rent + brokerage — their own rows and cumulative balances', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 15000]]),
      [
        line('li_rent', 't1', new Date('2026-10-05T00:00:00Z'), 'a', -13000, -13000, 'rent brokerage + contract'),
        line('li_brokerage', 't1', new Date('2026-10-05T00:00:00Z'), 'a', -2000, -2000, 'rent brokerage + contract'),
      ],
      NOW,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'li_rent', amount: -13000, balance_after: 2000, sufficient: true })
    expect(rows[1]).toMatchObject({ id: 'li_brokerage', amount: -2000, balance_after: 0, sufficient: true })
  })

  it('handles multiple assets independently', () => {
    const rows = compute_future_sufficiency(
      balances([
        ['a', 100],
        ['b', 100],
      ]),
      [
        line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'a', -50, -50),
        line('li2', 't1', new Date('2026-10-05T00:00:00Z'), 'b', -40, -40),
        line('li3', 't2', new Date('2026-10-10T00:00:00Z'), 'b', -70, -70),
      ],
      NOW,
    )
    expect(rows[0].sufficient).toBe(true)
    expect(rows[1].sufficient).toBe(true)
    expect(rows[2].sufficient).toBe(false)
  })

  it('treats an untouched asset as zero when first touched', () => {
    const rows = compute_future_sufficiency(new Map(), [line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'brand_new', -1, -1)], NOW)
    expect(rows[0].sufficient).toBe(false)
    expect(rows[0].balance_after).toBe(-1)
  })

  it('has no float rounding residue against zero (exact Decimal comparison)', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 500]]),
      [line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'a', '-500.00005', '-500.00005')],
      NOW,
    )
    // Exact Decimal math: 500 - 500.00005 = -0.00005, which is < 0 → insufficient.
    expect(rows[0].sufficient).toBe(false)
  })

  it('ranks line items in the sorted order callers pass (dependencies flow forward)', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 0]]),
      [line('li1', 't1', new Date('2026-10-05T00:00:00Z'), 'a', 100, 100), line('li2', 't2', new Date('2026-10-06T00:00:00Z'), 'a', -150, -150)],
      NOW,
    )
    expect(rows[0].sufficient).toBe(true)
    expect(rows[1].sufficient).toBe(false)
  })

  it('excludes an overdue (past-dated) line item from the walk and gives it null sufficiency/balance', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 100]]),
      [
        // Overdue: dated before `now`. Should not affect the running balance at all — if
        // it did, this huge inflow would make the next line item look sufficient.
        line('overdue', 't1', new Date('2026-09-01T00:00:00Z'), 'a', 100000, 100000),
        line('upcoming', 't2', new Date('2026-10-05T00:00:00Z'), 'a', -150, -150),
      ],
      NOW,
    )
    expect(rows[0].sufficient).toBe(null)
    expect(rows[0].balance_after).toBe(null)
    expect(rows[1].sufficient).toBe(false)
  })

  it('treats a line item dated exactly at `now` as upcoming, not overdue', () => {
    const rows = compute_future_sufficiency(balances([['a', 100]]), [line('li1', 't1', NOW, 'a', -50, -50)], NOW)
    expect(rows[0].sufficient).toBe(true)
  })
})
