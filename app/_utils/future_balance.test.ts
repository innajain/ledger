import { describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { compute_future_sufficiency } from './future_balance'
import { normalize_txn } from './normalize_txn'

const dec = (n: number | string) => new Prisma.Decimal(n)
const balances = (entries: [string, number | string][]) => new Map(entries.map(([k, v]) => [k, dec(v)] as const))

function txn(id: string, datetime: Date, lines: { asset_id: string; quantity: number | string; txn_value: number | string }[], description?: string) {
  return {
    id,
    datetime,
    description: description ?? null,
    line_items: lines.map(l => ({ asset_id: l.asset_id, quantity: dec(l.quantity), txn_value: dec(l.txn_value) })),
  }
}

const NOW = new Date('2026-10-01T00:00:00Z')

describe('compute_future_sufficiency', () => {
  it('marks a single sufficient outflow as sufficient', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 500]]),
      [txn('t1', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'a', quantity: -200, txn_value: -200 }])],
      NOW,
    )
    expect(rows[0].sufficient).toBe(true)
    expect(rows[0].amount).toBe(-200)
    expect(rows[0].per_asset_delta).toEqual([{ asset_id: 'a', qty: -200 }])
  })

  it('marks a single insufficient outflow as insufficient', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 500]]),
      [txn('t1', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'a', quantity: -600, txn_value: -600 }])],
      NOW,
    )
    expect(rows[0].sufficient).toBe(false)
  })

  it('makes a later outflow sufficient once an earlier inflow lands', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 100]]),
      [
        txn('t1', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'a', quantity: 500, txn_value: 500 }]),
        txn('t2', new Date('2026-10-10T00:00:00Z'), [{ asset_id: 'a', quantity: -400, txn_value: -400 }]),
        txn('t3', new Date('2026-10-15T00:00:00Z'), [{ asset_id: 'a', quantity: -400, txn_value: -400 }]),
      ],
      NOW,
    )
    expect(rows.map(r => r.sufficient)).toEqual([true, true, false])
  })

  it('handles multi-asset line items on the same head independently', () => {
    const rows = compute_future_sufficiency(
      balances([
        ['a', 100],
        ['b', 100],
      ]),
      [
        txn('t1', new Date('2026-10-05T00:00:00Z'), [
          { asset_id: 'a', quantity: -50, txn_value: -50 },
          { asset_id: 'b', quantity: -40, txn_value: -40 },
        ]),
        txn('t2', new Date('2026-10-10T00:00:00Z'), [{ asset_id: 'b', quantity: -70, txn_value: -70 }]),
      ],
      NOW,
    )
    // t1 keeps both assets >= 0; t2 drains asset b to -10 → insufficient overall.
    expect(rows[0].sufficient).toBe(true)
    expect(rows[1].sufficient).toBe(false)
  })

  it('treats an untouched asset as zero when first touched', () => {
    const rows = compute_future_sufficiency(
      new Map(),
      [txn('t1', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'brand_new', quantity: -1, txn_value: -1 }])],
      NOW,
    )
    expect(rows[0].sufficient).toBe(false)
  })

  it('returns null sufficiency when the transaction touches nothing on this head', () => {
    const rows = compute_future_sufficiency(balances([['a', 100]]), [txn('t1', new Date('2026-10-05T00:00:00Z'), [])], NOW)
    expect(rows[0].sufficient).toBe(null)
    expect(rows[0].amount).toBe(0)
  })

  it('has no float rounding residue against zero (exact Decimal comparison)', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 500]]),
      [txn('t1', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'a', quantity: '-500.00005', txn_value: '-500.00005' }])],
      NOW,
    )
    // Exact Decimal math: 500 - 500.00005 = -0.00005, which is < 0 → insufficient.
    // (A float-epsilon comparison used to wrongly call this sufficient.)
    expect(rows[0].sufficient).toBe(false)
  })

  it('ranks transactions in the sorted order callers pass (dependencies flow forward)', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 0]]),
      [
        txn('early', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'a', quantity: 100, txn_value: 100 }]),
        txn('late', new Date('2026-10-06T00:00:00Z'), [{ asset_id: 'a', quantity: -150, txn_value: -150 }]),
      ],
      NOW,
    )
    expect(rows[0].sufficient).toBe(true)
    expect(rows[1].sufficient).toBe(false)
  })

  it('excludes an overdue (past-dated) future transaction from the walk and gives it null sufficiency', () => {
    const rows = compute_future_sufficiency(
      balances([['a', 100]]),
      [
        // Overdue: dated before `now`. Should not affect the running balance at all —
        // if it did, this huge inflow would make the next transaction look sufficient.
        txn('overdue', new Date('2026-09-01T00:00:00Z'), [{ asset_id: 'a', quantity: 100000, txn_value: 100000 }]),
        txn('upcoming', new Date('2026-10-05T00:00:00Z'), [{ asset_id: 'a', quantity: -150, txn_value: -150 }]),
      ],
      NOW,
    )
    expect(rows[0].sufficient).toBe(null)
    expect(rows[1].sufficient).toBe(false)
  })

  it('treats a transaction dated exactly at `now` as upcoming, not overdue', () => {
    const rows = compute_future_sufficiency(balances([['a', 100]]), [txn('t1', NOW, [{ asset_id: 'a', quantity: -50, txn_value: -50 }])], NOW)
    expect(rows[0].sufficient).toBe(true)
  })
})

// A small integration-style check using the real normalizer on a balanced future
// transaction (one remainder line), feeding the algorithm the account head's lines.
describe('compute_future_sufficiency with normalized line items', () => {
  it('uses the derived remainder quantity like the head page would', () => {
    const raw = {
      id: 't1',
      datetime: new Date('2026-10-05T00:00:00Z'),
      description: 'Future rent',
      is_future: true,
      line_items: [
        {
          id: 'li1',
          description: null,
          datetime: null,
          transaction_id: 't1',
          accounting_head_id: 'h-gold',
          accounting_head: { type: 'account' },
          asset_id: 'a-rupee',
          asset: { id: 'a-rupee', type: 'rupees', name: '₹' },
          quantity: dec(-1500),
          txn_value: null,
        },
        {
          id: 'li2',
          description: null,
          datetime: null,
          transaction_id: 't1',
          accounting_head_id: 'h-re',
          accounting_head: { type: 'income_expense' },
          asset_id: 'a-rupee',
          asset: { id: 'a-rupee', type: 'rupees', name: '₹' },
          quantity: null,
          txn_value: null,
        },
      ],
    }
    const normalized = normalize_txn(raw as unknown as Parameters<typeof normalize_txn>[0])
    const head_lines = normalized.line_items
      .filter(li => li.accounting_head_id === 'h-gold')
      .map(li => ({
        asset_id: li.asset_id,
        quantity: li.quantity!,
        txn_value: li.txn_value!,
      }))
    const rows = compute_future_sufficiency(
      balances([['a-rupee', 2000]]),
      [{ id: 't1', datetime: normalized.datetime, description: normalized.description, line_items: head_lines }],
      NOW,
    )
    expect(rows[0].sufficient).toBe(true)
    expect(rows[0].amount).toBe(-1500)
  })
})
