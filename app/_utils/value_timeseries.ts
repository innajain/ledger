import { Prisma, asset_type } from '@/generated/prisma/client'
import { addDays, parseISO } from 'date-fns'
import { fromZonedTime } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { normalize_txn, type TransactionFull } from './normalize_txn'
import { get_price_lookups_for_assets, ist_date_key } from './historical_price_fetcher'

export type ValuePoint = {
  date: string // 'yyyy-MM-dd' in IST
  invested: number
  current: number
}

export type TimeseriesFilter =
  // Asset detail page: scope to one asset across all real accounts (FIFO per real account).
  | { kind: 'asset'; asset_id: string }
  // Real-account detail page: scope to one real account, all assets it holds (FIFO per asset).
  | { kind: 'account'; account_id: string }
  // Allocation detail page: scope to one allocation account, all assets it holds (no FIFO; running sum).
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

type Lot = {
  qty: Prisma.Decimal
  original_qty: Prisma.Decimal
  original_book: Prisma.Decimal
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
  // Chronological; ties: buys before sells so a same-day sell consumes from
  // the same-day buy when no older lot exists.
  events.sort((a, b) => {
    const cmp = a.date.getTime() - b.date.getTime()
    if (cmp !== 0) return cmp
    return b.qty.comparedTo(a.qty)
  })
  return events
}

export async function compute_value_timeseries(
  transactions: TransactionFull[],
  filter: TimeseriesFilter,
  assets: { id: string; type: asset_type; ticker: string | null }[],
): Promise<ValuePoint[]> {
  const events = build_events(transactions, filter)
  if (events.length === 0) return []

  const earliestDate = events[0].date
  const priceLookups = await get_price_lookups_for_assets(assets, earliestDate)
  const assetById = new Map(assets.map(a => [a.id, a]))

  // FIFO state per (account, asset). For allocation view we don't use FIFO;
  // we keep simple per-asset cumulative qty/book.
  const open_lots = new Map<string, Lot[]>() // key = `${account_id}|${asset_id}`
  const alloc_state = new Map<string, { qty: Prisma.Decimal; book: Prisma.Decimal }>()

  const apply_event = (e: Event) => {
    if (filter.kind === 'allocation') {
      const cur = alloc_state.get(e.asset_id) ?? { qty: new Prisma.Decimal(0), book: new Prisma.Decimal(0) }
      cur.qty = cur.qty.add(e.qty)
      cur.book = cur.book.add(e.book)
      alloc_state.set(e.asset_id, cur)
      return
    }
    // FIFO for asset / account views
    const key = `${e.account_id}|${e.asset_id}`
    if (!open_lots.has(key)) open_lots.set(key, [])
    const lots = open_lots.get(key)!
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

  const snapshot = (date: Date): { invested: Prisma.Decimal; current: Prisma.Decimal } => {
    let invested = new Prisma.Decimal(0)
    let current = new Prisma.Decimal(0)

    if (filter.kind === 'allocation') {
      for (const [asset_id, st] of alloc_state) {
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

    // asset / account: FIFO walk
    const qtyByAsset = new Map<string, Prisma.Decimal>()
    for (const [key, lots] of open_lots) {
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
        // Fall back to proportional book if no price available.
        const lots_for_asset = Array.from(open_lots.entries()).filter(([k]) => k.endsWith(`|${asset_id}`))
        let book_for_asset = new Prisma.Decimal(0)
        for (const [, lots] of lots_for_asset) {
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

  // Walk every IST day from the first event to today.
  const points: ValuePoint[] = []
  const todayKey = ist_date_key(new Date())
  let cursorKey = events[0].dateKey
  let appliedIndex = 0

  while (cursorKey <= todayKey) {
    while (appliedIndex < events.length && events[appliedIndex].dateKey <= cursorKey) {
      apply_event(events[appliedIndex])
      appliedIndex++
    }
    const cursorDate = fromZonedTime(parseISO(cursorKey), USER_TIMEZONE)
    const snap = snapshot(cursorDate)
    points.push({
      date: cursorKey,
      invested: snap.invested.toNumber(),
      current: snap.current.toNumber(),
    })
    const next = addDays(parseISO(cursorKey), 1)
    cursorKey = ist_date_key(fromZonedTime(next, USER_TIMEZONE))
  }

  return points
}
