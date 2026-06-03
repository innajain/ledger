import { describe, it, expect } from 'vitest'
import { Prisma, asset_type } from '@/generated/prisma/client'
import {
  build_events,
  walk_events,
  compute_timeseries_points,
  ist_date_key,
  reconcile_timeseries_tail,
  type Event,
  type TimeseriesFilter,
  type AssetMeta,
  type PriceLookup,
  type ValuePoint,
} from './value_timeseries_core'

const D = (n: number) => new Prisma.Decimal(n)
const MF: AssetMeta = { id: 'mf', type: asset_type.mf, ticker: 'XYZ' }
const CASH: AssetMeta = { id: 'rupees', type: asset_type.rupees, ticker: null }

// A constant-price lookup for one asset; everything else is unpriced (null).
const priceFor = (asset_id: string, price: number | null): Map<string, PriceLookup> => new Map([[asset_id, () => price]])

// Build an Event the way build_events would (dateKey derived from the date).
function ev(over: { asset_id?: string; asset_type?: asset_type; accounting_head_id?: string; qty: number; book: number; date: Date }): Event {
  return {
    asset_id: over.asset_id ?? MF.id,
    asset_type: over.asset_type ?? asset_type.mf,
    accounting_head_id: over.accounting_head_id ?? 'head',
    qty: D(over.qty),
    book: D(over.book),
    date: over.date,
    dateKey: ist_date_key(over.date),
  }
}

const ACCOUNT: TimeseriesFilter = { kind: 'account', accounting_head_id: 'head' }
const ALLOCATION: TimeseriesFilter = { kind: 'allocation', allocation_id: 'head' }

// IST is UTC+5:30, so use mid-day UTC to stay on the intended calendar day.
const day = (n: number) => new Date(Date.UTC(2024, 0, n, 6, 0, 0))

describe('reconcile_timeseries_tail', () => {
  it('overwrites only the last point', () => {
    const ts = [
      { date: '2024-01-01', invested: 1, current: 1, xirr: null },
      { date: '2024-01-02', invested: 2, current: 2, xirr: null },
    ]
    reconcile_timeseries_tail(ts, 99, 0.5)
    expect(ts[0]).toEqual({ date: '2024-01-01', invested: 1, current: 1, xirr: null })
    expect(ts[1]).toEqual({ date: '2024-01-02', invested: 2, current: 99, xirr: 0.5 })
  })

  it('is a no-op on an empty series', () => {
    const ts: ValuePoint[] = []
    expect(() => reconcile_timeseries_tail(ts, 99, 0.5)).not.toThrow()
  })
})

describe('walk_events — emits one point per IST day', () => {
  it('carries a holding forward across days at its market price', () => {
    const events = [ev({ qty: 10, book: 1000, date: day(1) })]
    const points = walk_events(events, ACCOUNT, priceFor(MF.id, 150), [MF], 'all', day(3))
    expect(points.map(p => p.date)).toEqual(['2024-01-01', '2024-01-02', '2024-01-03'])
    // 10 units @ 150 every day; invested stays at book.
    expect(points.every(p => p.current === 1500)).toBe(true)
    expect(points.every(p => p.invested === 1000)).toBe(true)
  })

  it('today-only mode walks all events but emits just the final day', () => {
    const events = [ev({ qty: 10, book: 1000, date: day(1) })]
    const points = walk_events(events, ACCOUNT, priceFor(MF.id, 150), [MF], 'today-only', day(3))
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ date: '2024-01-03', current: 1500, invested: 1000 })
  })

  it('falls back to book value when the asset has no price', () => {
    const events = [ev({ qty: 10, book: 1000, date: day(1) })]
    const points = walk_events(events, ACCOUNT, new Map(), [MF], 'today-only', day(1))
    expect(points[0].current).toBe(1000)
  })

  it('values rupees holdings at their quantity', () => {
    const events = [ev({ asset_id: CASH.id, asset_type: asset_type.rupees, qty: 500, book: 500, date: day(1) })]
    const points = walk_events(events, ACCOUNT, new Map(), [CASH], 'today-only', day(1))
    expect(points[0].current).toBe(500)
  })
})

describe('walk_events — FIFO lot accounting (account filter)', () => {
  it('reduces holdings and proportional book after a partial sell', () => {
    const events = [ev({ qty: 10, book: 1000, date: day(1) }), ev({ qty: -4, book: -400, date: day(2) })]
    const points = walk_events(events, ACCOUNT, priceFor(MF.id, 150), [MF], 'today-only', day(2))
    // 6 units remain @ 150 = 900; invested = 1000 * 6/10 = 600.
    expect(points[0].current).toBe(900)
    expect(points[0].invested).toBe(600)
  })

  it('computes a positive XIRR for a held gain over time', () => {
    const events = [ev({ qty: 10, book: 1000, date: day(1) })]
    // ~1 year later, holding now worth 1500 → ≈50% annualized.
    const oneYearLater = new Date(Date.UTC(2024, 11, 31, 6, 0, 0))
    const points = walk_events(events, ACCOUNT, priceFor(MF.id, 150), [MF], 'today-only', oneYearLater)
    expect(points[0].xirr).not.toBeNull()
    expect(points[0].xirr!).toBeCloseTo(0.5, 1)
  })
})

describe('walk_events — allocation accumulation (allocation filter)', () => {
  it('accumulates net qty/book and prices the position', () => {
    const events = [ev({ qty: 10, book: 1000, date: day(1) }), ev({ qty: 5, book: 500, date: day(2) })]
    const points = walk_events(events, ALLOCATION, priceFor(MF.id, 200), [MF], 'today-only', day(2))
    // 15 units @ 200 = 3000; invested = 1500 book.
    expect(points[0].current).toBe(3000)
    expect(points[0].invested).toBe(1500)
  })

  it('returns no points when there are no events', () => {
    expect(walk_events([], ALLOCATION, new Map(), [MF], 'all', day(3))).toEqual([])
  })
})

describe('build_events', () => {
  // Minimal balanced rupees transaction (passes normalize_txn): account -35,
  // with the null remainders on the allocation + income/expense sides.
  const makeTxn = (id: string, date: Date) => ({
    id,
    datetime: date,
    line_items: [
      {
        id: `${id}-a`,
        accounting_head_id: 'bank',
        asset_id: 'rupees',
        datetime: null,
        accounting_head: { id: 'bank', type: 'account' },
        asset: CASH,
        quantity: D(-35),
        txn_value: null,
      },
      {
        id: `${id}-x`,
        accounting_head_id: 'exp',
        asset_id: 'rupees',
        datetime: null,
        accounting_head: { id: 'exp', type: 'income_expense' },
        asset: CASH,
        quantity: null,
        txn_value: null,
      },
      {
        id: `${id}-l`,
        accounting_head_id: 'food',
        asset_id: 'rupees',
        datetime: null,
        accounting_head: { id: 'food', type: 'allocation' },
        asset: CASH,
        quantity: null,
        txn_value: null,
      },
    ],
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txns = (...t: any[]) => t as Parameters<typeof build_events>[0]

  it('keeps only line items matching the filtered head', () => {
    const events = build_events(txns(makeTxn('t1', day(1))), { kind: 'account', accounting_head_id: 'bank' })
    expect(events).toHaveLength(1)
    expect(events[0].accounting_head_id).toBe('bank')
    expect(events[0].qty.toNumber()).toBe(-35)
  })

  it('sorts events chronologically across transactions', () => {
    const events = build_events(txns(makeTxn('t2', day(5)), makeTxn('t1', day(1))), { kind: 'allocation', allocation_id: 'food' })
    expect(events.map(e => e.dateKey)).toEqual(['2024-01-01', '2024-01-05'])
  })

  it('asset-scoped filters only count account-side line items', () => {
    // The allocation/income_expense rupees lines also reference the asset, but
    // an asset filter must ignore non-account sides.
    const events = build_events(txns(makeTxn('t1', day(1))), { kind: 'asset', asset_id: 'rupees' })
    expect(events).toHaveLength(1)
    expect(events[0].accounting_head_id).toBe('bank')
  })
})

describe('compute_timeseries_points (build + walk)', () => {
  it('produces a daily series from raw transactions', () => {
    // A +100 rupees deposit into the bank account (income).
    const tx = {
      id: 't1',
      datetime: day(1),
      line_items: [
        {
          id: 'a',
          accounting_head_id: 'bank',
          asset_id: 'rupees',
          datetime: null,
          accounting_head: { id: 'bank', type: 'account' },
          asset: CASH,
          quantity: D(100),
          txn_value: null,
        },
        {
          id: 'x',
          accounting_head_id: 'inc',
          asset_id: 'rupees',
          datetime: null,
          accounting_head: { id: 'inc', type: 'income_expense' },
          asset: CASH,
          quantity: null,
          txn_value: null,
        },
        {
          id: 'l',
          accounting_head_id: 'savings',
          asset_id: 'rupees',
          datetime: null,
          accounting_head: { id: 'savings', type: 'allocation' },
          asset: CASH,
          quantity: null,
          txn_value: null,
        },
      ],
    }
    const points = compute_timeseries_points(
      [tx] as Parameters<typeof compute_timeseries_points>[0],
      { kind: 'account', accounting_head_id: 'bank' },
      new Map(),
      [CASH],
      'all',
      day(2),
    )
    expect(points.map(p => p.date)).toEqual(['2024-01-01', '2024-01-02'])
    // Bank holds +100 rupees from day 1 onward.
    expect(points.every(p => p.current === 100)).toBe(true)
  })
})
