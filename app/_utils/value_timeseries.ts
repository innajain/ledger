import { Prisma, asset_type } from '@/generated/prisma/client'
import { addDays, parseISO } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { get_current_user_id } from '@/app/_actions/auth'
import { normalize_txn, type TransactionFull } from './normalize_txn'
import { get_price_lookups_for_assets, ist_date_key, type PriceLookup } from './historical_price_fetcher'
import { calculate_xirr } from './xirr_calculator'

const VERSION_KEY = (user_id: string) => `timeseries_version:${user_id}`
const FROZEN_KEY = (user_id: string, version: number, kind: string, id: string) =>
  `timeseries_frozen:${user_id}:v${version}:${kind}:${id}`

export async function invalidate_timeseries(user_id: string): Promise<void> {
  await redis.incr(VERSION_KEY(user_id))
}

export type ValuePoint = {
  date: string // 'yyyy-MM-dd' in IST
  invested: number
  current: number
  xirr: number | null
}

export type TimeseriesFilter =
  | { kind: 'asset'; asset_id: string }
  | { kind: 'account'; account_id: string }
  | { kind: 'allocation'; allocation_id: string }

type Event = {
  asset_id: string
  asset_type: asset_type
  account_id: string
  qty: Prisma.Decimal
  book: Prisma.Decimal
  date: Date
  dateKey: string
}

type Lot = { qty: Prisma.Decimal; original_qty: Prisma.Decimal; original_book: Prisma.Decimal }
type AllocState = Map<string, { qty: Prisma.Decimal; book: Prisma.Decimal }>

type WalkState = {
  open_lots: Map<string, Lot[]> // key = `${account_id}|${asset_id}`
  alloc_state: AllocState
  cashflows: { amount: number; when: Date }[]
}

function entity_id_for_filter(filter: TimeseriesFilter): string {
  if (filter.kind === 'asset') return filter.asset_id
  if (filter.kind === 'account') return filter.account_id
  return filter.allocation_id
}

function build_events(transactions: TransactionFull[], filter: TimeseriesFilter): Event[] {
  const events: Event[] = []
  for (const tx of transactions) {
    const norm = normalize_txn(tx)
    for (const li of norm.line_items) {
      if (filter.kind === 'asset') {
        if (li.asset.id !== filter.asset_id) continue
        if (li.account.type !== 'real') continue
      } else if (filter.kind === 'account') {
        if (li.account.id !== filter.account_id) continue
      } else {
        if (li.account.id !== filter.allocation_id) continue
      }
      const date = li.datetime ?? tx.datetime
      events.push({
        asset_id: li.asset.id,
        asset_type: li.asset.type,
        account_id: li.account.id,
        qty: li.quantity,
        book: li.book_value,
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
    const key = `${e.account_id}|${e.asset_id}`
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
  assetById: Map<string, { id: string; type: asset_type; ticker: string | null }>,
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
 * Walks all events through the given range and emits one ValuePoint per IST
 * day. If `mode` is 'today-only', emits only the final day's point but still
 * walks all events to build the correct state.
 */
async function compute_value_timeseries_uncached(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
  mode: 'all' | 'today-only',
): Promise<ValuePoint[]> {
  const events = build_events(transactions, filter)
  if (events.length === 0) return []

  const earliestDate = events[0].date
  const priceLookups = await get_price_lookups_for_assets(assets, earliestDate)
  const assetById = new Map(assets.map(a => [a.id, a]))

  const state: WalkState = {
    open_lots: new Map(),
    alloc_state: new Map(),
    cashflows: [],
  }

  const points: ValuePoint[] = []
  const todayKey = ist_date_key(new Date())
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

type FrozenCache = { upToDate: string; points: ValuePoint[] }

/**
 * Indefinite-cache wrapper. Strategy:
 *   - Frozen historical points (everything before today) are stored in Redis
 *     with no TTL. Past days are immutable given the cashflows, so they only
 *     need to be recomputed when transactions change (handled by version bump).
 *   - Today's point is recomputed each call (cheap: walks events once and
 *     calls XIRR exactly once). The chart's caller then overrides this with
 *     live values from the InfoCard, so true freshness is preserved.
 *   - On a stale cache (user skipped days), discard and recompute fully.
 */
export async function compute_value_timeseries(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
): Promise<ValuePoint[]> {
  const user_id = await get_current_user_id()
  if (!user_id) return compute_value_timeseries_uncached(transactions, filter, assets, 'all')

  try {
    const versionRaw = await redis.get(VERSION_KEY(user_id))
    const version = versionRaw ? parseInt(versionRaw, 10) : 0
    const cacheKey = FROZEN_KEY(user_id, version, filter.kind, entity_id_for_filter(filter))

    const todayKey = ist_date_key(new Date())
    const yesterdayKey = ist_date_key(fromZonedTime(addDays(parseISO(todayKey), -1), USER_TIMEZONE))

    const cachedRaw = await redis.get(cacheKey)
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as FrozenCache
      if (cached.upToDate === yesterdayKey) {
        // Hot path: only recompute today.
        const todayPoints = await compute_value_timeseries_uncached(transactions, filter, assets, 'today-only')
        return [...cached.points, ...todayPoints]
      }
      // Cache is stale (user skipped days). Fall through to full recompute.
    }

    const allPoints = await compute_value_timeseries_uncached(transactions, filter, assets, 'all')
    if (allPoints.length > 0) {
      const last = allPoints[allPoints.length - 1]
      if (last.date === todayKey && allPoints.length > 1) {
        const frozen: FrozenCache = {
          upToDate: allPoints[allPoints.length - 2].date,
          points: allPoints.slice(0, -1),
        }
        // Indefinite cache: no TTL. Invalidated only by version bump.
        await redis.set(cacheKey, JSON.stringify(frozen))
      }
    }
    return allPoints
  } catch (err) {
    logger.warn({ err }, 'timeseries cache failed; falling back to uncached compute')
    return compute_value_timeseries_uncached(transactions, filter, assets, 'all')
  }
}
