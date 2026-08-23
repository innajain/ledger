import { Prisma } from '@/generated/prisma/client'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'

// A compact net-worth trend for the home sparkline.
//
// Rather than replaying the whole ledger forward (what compute_value_timeseries does per
// head — one XIRR per day, far too heavy for a first-paint card), this starts from the
// *current* per-asset balance and walks backwards, undoing only the events inside the
// window. So the cost is "transactions in the window", not "transactions ever", and the
// last point is by construction the same net worth the hero card shows.
//
// Valuation mirrors compute_head_value: a price means quantity × price, no price means
// fall back to book value.

/** One IST calendar day: [start, end). */
export type SparkDay = { key: string; start: Date; end: Date }

/** A signed movement on an allocation head, i.e. a change in net worth. */
export type SparkEvent = { asset_id: string; at: Date; qty: number; book: number }

export type AssetBalance = { qty: number; txn_value: number }

export type SparkPoint = { date: string; value: number }

export type PriceAt = (asset_id: string, at: Date) => number | null

const DAY_MS = 24 * 60 * 60 * 1000

const round2 = (n: number) => Math.round(n * 100) / 100

/** The last `days` IST calendar days, oldest first, ending with the day `now` falls in. */
export function ist_day_window(now: Date, days: number): SparkDay[] {
  const today_key = formatInTimeZone(now, USER_TIMEZONE, 'yyyy-MM-dd')
  const today_start = fromZonedTime(`${today_key}T00:00:00`, USER_TIMEZONE)
  const window: SparkDay[] = []
  // IST has no DST, so stepping by exact 24h stays on midnight.
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(today_start.getTime() - i * DAY_MS)
    window.push({ key: formatInTimeZone(start, USER_TIMEZONE, 'yyyy-MM-dd'), start, end: new Date(start.getTime() + DAY_MS) })
  }
  return window
}

type LineLike = {
  accounting_head: { type: string }
  asset_id: string
  datetime: Date | null
  quantity: Prisma.Decimal
  txn_value: Prisma.Decimal
}

type TxnLike = { datetime: Date; line_items: LineLike[] }

/**
 * Net-worth movements from already-normalized transactions. Allocation heads are the basis
 * because net worth is the total across them (per-asset they mirror the account lines), and
 * per-line datetime overrides win over the transaction's own datetime.
 */
export function collect_networth_events(transactions: TxnLike[]): SparkEvent[] {
  const events: SparkEvent[] = []
  for (const txn of transactions) {
    for (const li of txn.line_items) {
      if (li.accounting_head.type !== 'allocation') continue
      events.push({
        asset_id: li.asset_id,
        at: li.datetime ?? txn.datetime,
        qty: li.quantity.toNumber(),
        book: li.txn_value.toNumber(),
      })
    }
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime())
  return events
}

/**
 * One point per day in `window`. `current` is today's per-asset balance (quantity + book
 * value); `events` need only cover the window — anything older is already baked into it.
 */
export function build_networth_sparkline(
  window: SparkDay[],
  current: ReadonlyMap<string, AssetBalance>,
  events: SparkEvent[],
  price_at: PriceAt,
): SparkPoint[] {
  if (window.length === 0) return []

  const state = new Map<string, AssetBalance>()
  for (const [asset_id, balance] of current) state.set(asset_id, { qty: balance.qty, txn_value: balance.txn_value })

  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime())
  let cursor = sorted.length - 1
  const points: SparkPoint[] = []

  for (let i = window.length - 1; i >= 0; i--) {
    const day = window[i]
    // Undo everything that happened after this day closed.
    while (cursor >= 0 && sorted[cursor].at.getTime() >= day.end.getTime()) {
      const event = sorted[cursor]
      const balance = state.get(event.asset_id) ?? { qty: 0, txn_value: 0 }
      state.set(event.asset_id, { qty: balance.qty - event.qty, txn_value: balance.txn_value - event.book })
      cursor--
    }

    let total = 0
    for (const [asset_id, balance] of state) {
      if (balance.qty === 0 && balance.txn_value === 0) continue
      const price = price_at(asset_id, day.end)
      total += price !== null ? price * balance.qty : balance.txn_value
    }
    points.push({ date: day.key, value: round2(total) })
  }

  return points.reverse()
}
