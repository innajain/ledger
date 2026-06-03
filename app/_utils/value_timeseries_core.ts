import { Prisma, asset_type } from '@/generated/prisma/client'
import { addDays, parseISO } from 'date-fns'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { normalize_txn, type TransactionFull } from './normalize_txn'
import { calculate_xirr } from './xirr_calculator'

// Pure valuation engine for per-day value timeseries. Holds no I/O — prices are
// passed in as resolver functions — so the FIFO / accumulation walk is unit
// testable. The server-only caching + price-fetching shell lives in
// ./value_timeseries (which re-exports the public surface).

// Resolves an asset's price for a given historical date. Mirrors the type in
// historical_price_fetcher; `null` means no price (fall back to book value).
export type PriceLookup = (date: Date) => number | null

export type AssetMeta = { id: string; type: asset_type; ticker: string | null }

export type ValuePoint = {
  date: string // 'yyyy-MM-dd' in IST
  invested: number
  current: number
  xirr: number | null
}

export type TimeseriesFilter =
  | { kind: 'asset'; asset_id: string }
  | { kind: 'account'; accounting_head_id: string }
  | { kind: 'allocation'; allocation_id: string }

// All price closes are published once per Indian calendar day; aligning to IST
// avoids off-by-one errors from UTC midnight crossings.
export function ist_date_key(date: Date): string {
  return formatInTimeZone(date, USER_TIMEZONE, 'yyyy-MM-dd')
}

// Overwrite the final point with live current/xirr values (the chart's caller
// reconciles the tail against the InfoCard's live numbers).
export function reconcile_timeseries_tail(timeseries: ValuePoint[], current: number, xirr: number | null): void {
  if (timeseries.length > 0) {
    const last = timeseries[timeseries.length - 1]
    last.current = current
    last.xirr = xirr
  }
}

export type Event = {
  asset_id: string
  asset_type: asset_type
  accounting_head_id: string
  qty: Prisma.Decimal
  book: Prisma.Decimal
  date: Date
  dateKey: string
}

type Lot = { qty: Prisma.Decimal; original_qty: Prisma.Decimal; original_book: Prisma.Decimal }
type AllocState = Map<string, { qty: Prisma.Decimal; book: Prisma.Decimal }>

type WalkState = {
  open_lots: Map<string, Lot[]> // key = `${accounting_head_id}|${asset_id}`
  alloc_state: AllocState
  cashflows: { amount: number; when: Date }[]
}

export function build_events(transactions: TransactionFull[], filter: TimeseriesFilter): Event[] {
  const events: Event[] = []
  for (const tx of transactions) {
    const norm = normalize_txn(tx)
    for (const li of norm.line_items) {
      if (filter.kind === 'asset') {
        if (li.asset.id !== filter.asset_id) continue
        if (li.accounting_head.type !== 'account') continue
      } else if (filter.kind === 'account') {
        if (li.accounting_head.id !== filter.accounting_head_id) continue
      } else {
        if (li.accounting_head.id !== filter.allocation_id) continue
      }
      const date = li.datetime ?? tx.datetime
      events.push({
        asset_id: li.asset.id,
        asset_type: li.asset.type,
        accounting_head_id: li.accounting_head.id,
        qty: li.quantity,
        book: li.txn_value,
        date,
        dateKey: ist_date_key(date),
      })
    }
  }
  events.sort((a, b) => {
    const cmp = a.date.getTime() - b.date.getTime()
    if (cmp !== 0) return cmp
    return b.qty.comparedTo(a.qty)
  })
  return events
}

function apply_event(state: WalkState, filter: TimeseriesFilter, e: Event): void {
  if (filter.kind === 'allocation') {
    const cur = state.alloc_state.get(e.asset_id) ?? { qty: new Prisma.Decimal(0), book: new Prisma.Decimal(0) }
    cur.qty = cur.qty.add(e.qty)
    cur.book = cur.book.add(e.book)
    state.alloc_state.set(e.asset_id, cur)
  } else {
    const key = `${e.accounting_head_id}|${e.asset_id}`
    if (!state.open_lots.has(key)) state.open_lots.set(key, [])
    const lots = state.open_lots.get(key)!
    if (e.qty.greaterThan(0)) {
      lots.push({ qty: e.qty, original_qty: e.qty, original_book: e.book })
    } else if (e.qty.lessThan(0)) {
      let to_consume = e.qty.neg()
      while (to_consume.greaterThan(0) && lots.length > 0) {
        const lot = lots[0]
        if (lot.qty.lessThanOrEqualTo(to_consume)) {
          to_consume = to_consume.sub(lot.qty)
          lots.shift()
        } else {
          lot.qty = lot.qty.sub(to_consume)
          to_consume = new Prisma.Decimal(0)
        }
      }
    }
  }
  state.cashflows.push({ amount: -e.book.toNumber(), when: e.date })
}

function snapshot(
  state: WalkState,
  filter: TimeseriesFilter,
  priceLookups: Map<string, PriceLookup>,
  assetById: Map<string, AssetMeta>,
  date: Date,
): { invested: Prisma.Decimal; current: Prisma.Decimal } {
  let invested = new Prisma.Decimal(0)
  let current = new Prisma.Decimal(0)

  if (filter.kind === 'allocation') {
    for (const [asset_id, st] of state.alloc_state) {
      if (st.qty.equals(0)) continue
      invested = invested.add(st.book)
      const a = assetById.get(asset_id)
      if (!a) continue
      if (a.type === asset_type.rupees) {
        current = current.add(st.qty)
        continue
      }
      const price = priceLookups.get(asset_id)?.(date) ?? null
      if (price === null) {
        current = current.add(st.book)
        continue
      }
      current = current.add(st.qty.mul(new Prisma.Decimal(price)))
    }
    return { invested, current }
  }

  const qtyByAsset = new Map<string, Prisma.Decimal>()
  for (const [key, lots] of state.open_lots) {
    const asset_id = key.split('|')[1]
    for (const lot of lots) {
      if (lot.original_qty.equals(0)) continue
      const proportional_book = lot.original_book.mul(lot.qty).div(lot.original_qty)
      invested = invested.add(proportional_book)
      const cur = qtyByAsset.get(asset_id) ?? new Prisma.Decimal(0)
      qtyByAsset.set(asset_id, cur.add(lot.qty))
    }
  }
  for (const [asset_id, qty] of qtyByAsset) {
    const a = assetById.get(asset_id)
    if (!a) continue
    if (a.type === asset_type.rupees) {
      current = current.add(qty)
      continue
    }
    const price = priceLookups.get(asset_id)?.(date) ?? null
    if (price === null) {
      let book_for_asset = new Prisma.Decimal(0)
      for (const [k, lots] of state.open_lots) {
        if (!k.endsWith(`|${asset_id}`)) continue
        for (const lot of lots) {
          if (lot.original_qty.equals(0)) continue
          book_for_asset = book_for_asset.add(lot.original_book.mul(lot.qty).div(lot.original_qty))
        }
      }
      current = current.add(book_for_asset)
      continue
    }
    current = current.add(qty.mul(new Prisma.Decimal(price)))
  }
  return { invested, current }
}

function compute_xirr_for(state: WalkState, snap: { current: Prisma.Decimal }, date: Date): number | null {
  if (state.cashflows.length === 0 || snap.current.equals(0)) return null
  return calculate_xirr([...state.cashflows, { amount: snap.current.toNumber(), when: date }])
}

/**
 * Walks pre-built events through the range [first event day .. today] and emits
 * one ValuePoint per IST day. With `mode: 'today-only'` it emits only the final
 * day's point but still walks every event to build the correct state. `now`
 * is injectable for deterministic tests.
 */
export function walk_events(
  events: Event[],
  filter: TimeseriesFilter,
  priceLookups: Map<string, PriceLookup>,
  assets: AssetMeta[],
  mode: 'all' | 'today-only',
  now: Date = new Date(),
): ValuePoint[] {
  if (events.length === 0) return []
  const assetById = new Map(assets.map(a => [a.id, a]))

  const state: WalkState = { open_lots: new Map(), alloc_state: new Map(), cashflows: [] }
  const points: ValuePoint[] = []
  const todayKey = ist_date_key(now)
  let cursorKey = events[0].dateKey
  let appliedIndex = 0

  while (cursorKey <= todayKey) {
    while (appliedIndex < events.length && events[appliedIndex].dateKey <= cursorKey) {
      apply_event(state, filter, events[appliedIndex])
      appliedIndex++
    }

    const isToday = cursorKey === todayKey
    if (mode === 'all' || isToday) {
      const cursorDate = fromZonedTime(parseISO(cursorKey), USER_TIMEZONE)
      const snap = snapshot(state, filter, priceLookups, assetById, cursorDate)
      points.push({
        date: cursorKey,
        invested: snap.invested.toNumber(),
        current: snap.current.toNumber(),
        xirr: compute_xirr_for(state, snap, cursorDate),
      })
    }

    const next = addDays(parseISO(cursorKey), 1)
    cursorKey = ist_date_key(fromZonedTime(next, USER_TIMEZONE))
  }

  return points
}

/** Convenience: build events from raw transactions then walk them. */
export function compute_timeseries_points(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  priceLookups: Map<string, PriceLookup>,
  assets: AssetMeta[],
  mode: 'all' | 'today-only',
  now: Date = new Date(),
): ValuePoint[] {
  return walk_events(build_events(transactions, filter), filter, priceLookups, assets, mode, now)
}
