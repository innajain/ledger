import { Prisma, asset_type } from '@/generated/prisma/client'
import { parseISO } from 'date-fns'
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { normalize_txn, type TransactionFull } from './normalize_txn'
import { calculate_xirr_detailed } from './xirr_calculator'

export type PriceLookup = (date: Date) => number | null

export type AssetMeta = { id: string; type: asset_type; ticker: string | null }

export type ValuePoint = {
  date: string
  invested: number
  current: number
  xirr: number | null
}

export type TimeseriesFilter =
  | { kind: 'asset'; asset_id: string }
  | { kind: 'account'; accounting_head_id: string }
  | { kind: 'allocation'; allocation_id: string }

export function ist_date_key(date: Date): string {
  return formatInTimeZone(date, USER_TIMEZONE, 'yyyy-MM-dd')
}

// Plain calendar-day arithmetic on yyyy-MM-dd keys. The keys are already IST calendar
// days, so stepping them needs no timezone machinery — the old parse/convert/format
// round trip was an identity on the calendar day and dominated the walk's cost.
export function next_day_key(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function prev_day_key(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

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
  open_lots: Map<string, Lot[]>
  // Incremental per-asset aggregates over open lots, so snapshot() is O(assets) per
  // day instead of O(lots). book is the proportional remaining book of open lots.
  qty_by_asset: Map<string, Prisma.Decimal>
  book_by_asset: Map<string, Prisma.Decimal>
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

function add_to_asset_aggregates(state: WalkState, asset_id: string, qty: Prisma.Decimal, book: Prisma.Decimal): void {
  state.qty_by_asset.set(asset_id, (state.qty_by_asset.get(asset_id) ?? new Prisma.Decimal(0)).add(qty))
  state.book_by_asset.set(asset_id, (state.book_by_asset.get(asset_id) ?? new Prisma.Decimal(0)).add(book))
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
      add_to_asset_aggregates(state, e.asset_id, e.qty, e.book)
    } else if (e.qty.lessThan(0)) {
      let to_consume = e.qty.neg()
      while (to_consume.greaterThan(0) && lots.length > 0) {
        const lot = lots[0]
        if (lot.qty.lessThanOrEqualTo(to_consume)) {
          to_consume = to_consume.sub(lot.qty)
          add_to_asset_aggregates(state, e.asset_id, lot.qty.neg(), lot.original_book.mul(lot.qty).div(lot.original_qty).neg())
          lots.shift()
        } else {
          lot.qty = lot.qty.sub(to_consume)
          add_to_asset_aggregates(state, e.asset_id, to_consume.neg(), lot.original_book.mul(to_consume).div(lot.original_qty).neg())
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

  for (const [asset_id, qty] of state.qty_by_asset) {
    const book = state.book_by_asset.get(asset_id) ?? new Prisma.Decimal(0)
    invested = invested.add(book)
    const a = assetById.get(asset_id)
    if (!a) continue
    if (a.type === asset_type.rupees) {
      current = current.add(qty)
      continue
    }
    const price = priceLookups.get(asset_id)?.(date) ?? null
    if (price === null) {
      current = current.add(book)
      continue
    }
    current = current.add(qty.mul(new Prisma.Decimal(price)))
  }
  return { invested, current }
}

function compute_xirr_for(
  state: WalkState,
  snap: { current: Prisma.Decimal },
  date: Date,
  warm_start?: number,
): { xirr: number | null; raw_rate?: number } {
  if (state.cashflows.length === 0 || snap.current.equals(0)) return { xirr: null }
  // Append the terminal flow in place instead of copying the whole history each day.
  state.cashflows.push({ amount: snap.current.toNumber(), when: date })
  try {
    const result = calculate_xirr_detailed(state.cashflows, warm_start)
    if (!result) return { xirr: null }
    return { xirr: result.display, raw_rate: result.raw }
  } finally {
    state.cashflows.pop()
  }
}

export type WalkMode = 'all' | 'today-only' | { since: string }

export function walk_events(
  events: Event[],
  filter: TimeseriesFilter,
  priceLookups: Map<string, PriceLookup>,
  assets: AssetMeta[],
  mode: WalkMode,
  now: Date = new Date(),
): ValuePoint[] {
  if (events.length === 0) return []
  const assetById = new Map(assets.map(a => [a.id, a]))

  const state: WalkState = {
    open_lots: new Map(),
    qty_by_asset: new Map(),
    book_by_asset: new Map(),
    alloc_state: new Map(),
    cashflows: [],
  }
  const points: ValuePoint[] = []
  const todayKey = ist_date_key(now)
  const sinceKey = mode === 'all' ? null : mode === 'today-only' ? prev_day_key(todayKey) : mode.since

  let cursorKey = events[0].dateKey
  let appliedIndex = 0

  if (sinceKey !== null && sinceKey >= cursorKey) {
    // Fast-forward: apply everything up to the frozen prefix in one pass instead of
    // stepping through every historical day.
    while (appliedIndex < events.length && events[appliedIndex].dateKey <= sinceKey) {
      apply_event(state, filter, events[appliedIndex])
      appliedIndex++
    }
    cursorKey = next_day_key(sinceKey)
  }

  let warm_start: number | undefined

  while (cursorKey <= todayKey) {
    while (appliedIndex < events.length && events[appliedIndex].dateKey <= cursorKey) {
      apply_event(state, filter, events[appliedIndex])
      appliedIndex++
    }

    if (sinceKey === null || cursorKey > sinceKey) {
      const cursorDate = fromZonedTime(parseISO(cursorKey), USER_TIMEZONE)
      const snap = snapshot(state, filter, priceLookups, assetById, cursorDate)
      const xirr_result = compute_xirr_for(state, snap, cursorDate, warm_start)
      // Yesterday's converged rate is an excellent first guess for today — Newton
      // typically finishes in 1-3 iterations instead of sweeping 8 guesses.
      warm_start = xirr_result.raw_rate
      points.push({
        date: cursorKey,
        invested: snap.invested.toNumber(),
        current: snap.current.toNumber(),
        xirr: xirr_result.xirr,
      })
    }

    cursorKey = next_day_key(cursorKey)
  }

  return points
}

export function compute_timeseries_points(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  priceLookups: Map<string, PriceLookup>,
  assets: AssetMeta[],
  mode: WalkMode,
  now: Date = new Date(),
): ValuePoint[] {
  return walk_events(build_events(transactions, filter), filter, priceLookups, assets, mode, now)
}
