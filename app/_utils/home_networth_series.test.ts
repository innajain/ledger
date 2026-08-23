import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { ist_day_window, collect_networth_events, build_networth_sparkline, type SparkEvent, type AssetBalance } from './home_networth_series'
import { get_date_obj_from_indian_date } from './date'

const ist = (s: string) => get_date_obj_from_indian_date(s)
const ist_at = (s: string, hours: number) => new Date(ist(s).getTime() + hours * 3600 * 1000)
const dec = (n: number) => new Prisma.Decimal(n)

describe('ist_day_window', () => {
  it('ends on the IST day of the given instant', () => {
    const window = ist_day_window(ist_at('23-08-2026', 14), 3)
    expect(window.map(d => d.key)).toEqual(['2026-08-21', '2026-08-22', '2026-08-23'])
  })

  it('uses IST days, not UTC ones', () => {
    // 23:00 IST on the 23rd is 17:30 UTC on the 23rd; late-UTC-evening must not roll over.
    expect(ist_day_window(ist_at('23-08-2026', 23), 1)[0].key).toBe('2026-08-23')
    // 00:30 IST on the 23rd is 19:00 UTC on the 22nd.
    expect(ist_day_window(new Date(ist('23-08-2026').getTime() + 30 * 60 * 1000), 1)[0].key).toBe('2026-08-23')
  })

  it('gives each day a half-open [start, end) span', () => {
    const [day] = ist_day_window(ist_at('23-08-2026', 10), 1)
    expect(day.start.getTime()).toBe(ist('23-08-2026').getTime())
    expect(day.end.getTime()).toBe(ist('24-08-2026').getTime())
  })
})

describe('collect_networth_events', () => {
  const line = (type: string, asset_id: string, qty: number, book: number, datetime: Date | null = null) => ({
    accounting_head: { type },
    asset_id,
    datetime,
    quantity: dec(qty),
    txn_value: dec(book),
  })

  it('keeps allocation lines only', () => {
    const events = collect_networth_events([
      {
        datetime: ist_at('10-08-2026', 9),
        line_items: [line('account', 'money', -35, -35), line('income_expense', 'money', -35, -35), line('allocation', 'money', -35, -35)],
      },
    ])
    expect(events).toEqual<SparkEvent[]>([{ asset_id: 'money', at: ist_at('10-08-2026', 9), qty: -35, book: -35 }])
  })

  it('prefers a per-line datetime override and sorts chronologically', () => {
    const events = collect_networth_events([
      { datetime: ist_at('10-08-2026', 9), line_items: [line('allocation', 'money', -1, -1, ist_at('02-08-2026', 9))] },
      { datetime: ist_at('05-08-2026', 9), line_items: [line('allocation', 'money', -2, -2)] },
    ])
    expect(events.map(e => e.at.getTime())).toEqual([ist_at('02-08-2026', 9).getTime(), ist_at('05-08-2026', 9).getTime()])
  })
})

describe('build_networth_sparkline', () => {
  const rupees_only = () => 1

  it('walks back from the current balance, undoing in-window events', () => {
    const window = ist_day_window(ist_at('23-08-2026', 18), 3)
    const current = new Map<string, AssetBalance>([['money', { qty: 1000, txn_value: 1000 }]])
    const events: SparkEvent[] = [
      { asset_id: 'money', at: ist_at('22-08-2026', 10), qty: -200, book: -200 },
      { asset_id: 'money', at: ist_at('23-08-2026', 10), qty: 500, book: 500 },
    ]
    expect(build_networth_sparkline(window, current, events, rupees_only)).toEqual([
      { date: '2026-08-21', value: 700 },
      { date: '2026-08-22', value: 500 },
      { date: '2026-08-23', value: 1000 },
    ])
  })

  it('values a priced holding at its price and an unpriced one at book', () => {
    const window = ist_day_window(ist_at('23-08-2026', 18), 1)
    const current = new Map<string, AssetBalance>([
      ['mf', { qty: 10, txn_value: 1000 }],
      ['gold', { qty: 5, txn_value: 4000 }],
    ])
    const price_at = (asset_id: string) => (asset_id === 'mf' ? 150 : null)
    expect(build_networth_sparkline(window, current, [], price_at)).toEqual([{ date: '2026-08-23', value: 5500 }])
  })

  it('drops assets that fully net out', () => {
    const window = ist_day_window(ist_at('23-08-2026', 18), 1)
    const current = new Map<string, AssetBalance>([['sold', { qty: 0, txn_value: 0 }]])
    const price_at = () => {
      throw new Error('should not price a zeroed asset')
    }
    expect(build_networth_sparkline(window, current, [], price_at)).toEqual([{ date: '2026-08-23', value: 0 }])
  })

  it('ignores events that land after the window', () => {
    const window = ist_day_window(ist_at('23-08-2026', 18), 2)
    const current = new Map<string, AssetBalance>([['money', { qty: 100, txn_value: 100 }]])
    const events: SparkEvent[] = [{ asset_id: 'money', at: ist_at('01-08-2026', 9), qty: 50, book: 50 }]
    expect(build_networth_sparkline(window, current, events, rupees_only)).toEqual([
      { date: '2026-08-22', value: 100 },
      { date: '2026-08-23', value: 100 },
    ])
  })

  it('returns nothing for an empty window', () => {
    expect(build_networth_sparkline([], new Map(), [], rupees_only)).toEqual([])
  })
})
