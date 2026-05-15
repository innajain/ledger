import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import ClientPage from './ClientPage'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries } from '@/app/_utils/value_timeseries'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Asset</h1>
        <p>Please log in to view this asset.</p>
      </div>
    )
  }

  const asset = await prisma.asset.findUnique({
    where: { id, user_id: user.id },
    include: {
      line_items: { include: { account: true, transaction: true } },
      parent: true,
    },
  })

  if (!asset) {
    return (
      <div>
        <h1>Asset</h1>
        <p>Asset not found.</p>
      </div>
    )
  }

  const tx_ids = Array.from(new Set(asset.line_items.map(li => li.transaction_id)))
  const rawTransactions = await prisma.transaction.findMany({
    where: { id: { in: tx_ids } },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  // compute total across real accounts and aggregate holdings by account
  let asset_total = new Prisma.Decimal(0)
  let book_total = new Prisma.Decimal(0)
  const breakdown: {
    account_id: string
    account_name: string
    quantity: number
    book_value: number | null
    current_value: number
  }[] = []

  const real_line_items = asset.line_items.filter(li => li.account.type === 'real')
  const allocation_line_items = asset.line_items.filter(li => li.account.type === 'allocation')

  // single price fetch for this asset, reused across all its line items
  const priceResp = await get_price_for_asset(asset.type, asset.ticker ?? null)
  const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null

  // aggregate per-account
  const map: Record<
    string,
    {
      account_id: string
      account_name: string
      total_qty: Prisma.Decimal
      total_book: Prisma.Decimal
    }
  > = {}
  for (const li of real_line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const book = n.book_value!
    const aid = li.account.id
    if (!map[aid]) {
      map[aid] = {
        account_id: aid,
        account_name: li.account.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
      }
    }
    map[aid].total_qty = map[aid].total_qty.add(qty)
    map[aid].total_book = map[aid].total_book.add(book)
  }

  for (const k of Object.keys(map)) {
    const entry = map[k]

    let current_value = new Prisma.Decimal(0)
    if (asset.type === asset_type.rupees) {
      current_value = entry.total_qty
    } else if (priceDecimal) {
      current_value = priceDecimal.mul(entry.total_qty)
    } else {
      current_value = entry.total_book
    }

    if (current_value.equals(0)) continue

    asset_total = asset_total.add(current_value)
    book_total = book_total.add(entry.total_book)

    breakdown.push({
      account_id: entry.account_id,
      account_name: entry.account_name,
      quantity: entry.total_qty.toNumber(),
      book_value: entry.total_book.toNumber(),
      current_value: current_value.toNumber(),
    })
  }

  // aggregate per-allocation
  const alloc_map: Record<string, { allocation_id: string; allocation_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal }> = {}
  for (const li of allocation_line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const book = n.book_value!
    const aid = li.account.id
    if (!alloc_map[aid]) {
      alloc_map[aid] = { allocation_id: aid, allocation_name: li.account.name, total_qty: new Prisma.Decimal(0), total_book: new Prisma.Decimal(0) }
    }
    alloc_map[aid].total_qty = alloc_map[aid].total_qty.add(qty)
    alloc_map[aid].total_book = alloc_map[aid].total_book.add(book)
  }

  const allocation_breakdown: {
    allocation_id: string
    allocation_name: string
    quantity: number
    book_value: number | null
    current_value: number
  }[] = []
  for (const k of Object.keys(alloc_map)) {
    const entry = alloc_map[k]
    if (entry.total_qty.equals(0)) continue
    let current_value: Prisma.Decimal
    if (asset.type === asset_type.rupees) current_value = entry.total_qty
    else if (priceDecimal) current_value = priceDecimal.mul(entry.total_qty)
    else current_value = entry.total_book
    allocation_breakdown.push({
      allocation_id: entry.allocation_id,
      allocation_name: entry.allocation_name,
      quantity: entry.total_qty.toNumber(),
      book_value: asset.type === asset_type.rupees ? null : entry.total_book.toNumber(),
      current_value: current_value.toNumber(),
    })
  }

  // prepare per-line items for client (keep transaction-level detail)
  const items_with_meta = real_line_items.map(li => {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const book = n.book_value!

    let current_value: Prisma.Decimal
    if (asset.type === asset_type.rupees) current_value = qty
    else if (priceDecimal) current_value = priceDecimal.mul(qty)
    else current_value = book

    return {
      li,
      qty,
      book,
      current_value,
      sortDate: li.datetime ?? li.transaction.datetime,
    }
  })

  // FIFO per real account: a sell consumes from the oldest open buy lot in
  // the same account. Cross-account transfers naturally don't interact since
  // each account has its own queue.
  const remaining_by_id = new Map<string, Prisma.Decimal>()
  if (asset.type !== asset_type.rupees) {
    const chrono = [...items_with_meta].sort((a, b) => {
      const cmp = a.sortDate.getTime() - b.sortDate.getTime()
      if (cmp !== 0) return cmp
      // Same instant: process buys before sells so a sell consumes from
      // older lots first (or from the same-instant buy if no older lots exist).
      return b.qty.comparedTo(a.qty)
    })
    const open_lots_by_account = new Map<string, { id: string; remaining: Prisma.Decimal }[]>()
    for (const item of chrono) {
      const aid = item.li.account.id
      if (!open_lots_by_account.has(aid)) open_lots_by_account.set(aid, [])
      const open_lots = open_lots_by_account.get(aid)!
      if (item.qty.greaterThan(0)) {
        open_lots.push({ id: item.li.id, remaining: item.qty })
        remaining_by_id.set(item.li.id, item.qty)
      } else if (item.qty.lessThan(0)) {
        let to_consume = item.qty.neg()
        while (to_consume.greaterThan(0) && open_lots.length > 0) {
          const lot = open_lots[0]
          if (lot.remaining.lessThanOrEqualTo(to_consume)) {
            to_consume = to_consume.sub(lot.remaining)
            remaining_by_id.set(lot.id, new Prisma.Decimal(0))
            open_lots.shift()
          } else {
            lot.remaining = lot.remaining.sub(to_consume)
            remaining_by_id.set(lot.id, lot.remaining)
            to_consume = new Prisma.Decimal(0)
          }
        }
      }
    }
  }

  const line_items = items_with_meta
    .map(({ li, qty, book, current_value, sortDate }) => ({
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      quantity: qty.toNumber(),
      book_value: book.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
      remaining_quantity: remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null,
      _sortDate: sortDate,
    }))
    .sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _sortDate, ...rest }) => rest)

  let xirr_value: number | null = null
  if (asset.type !== asset_type.rupees && real_line_items.length > 0) {
    const cashflows = real_line_items.map(li => {
      const bv = normalizedById.get(li.id)!.book_value!
      return {
        amount: -bv.toNumber(),
        when: li.datetime ?? li.transaction.datetime,
      }
    })

    if (!asset_total.equals(0)) {
      cashflows.push({
        amount: asset_total.toNumber(),
        when: new Date(),
      })
    }
    xirr_value = calculate_xirr(cashflows)
  }

  const has_priced_asset = asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares'
  const value_timeseries = has_priced_asset
    ? await compute_value_timeseries(rawTransactions, { kind: 'asset', asset_id: asset.id }, [
        { id: asset.id, type: asset.type, ticker: asset.ticker },
      ])
    : []

  // Reconcile today's chart point with the live values used in the InfoCard so
  // the XIRR/current shown at the top of the page matches the chart's tail
  // (historical NAV for "today" may not be published yet on mfapi.in).
  if (value_timeseries.length > 0) {
    const last = value_timeseries[value_timeseries.length - 1]
    last.current = asset_total.toNumber()
    last.xirr = xirr_value
  }

  const assetForClient = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ticker: asset.ticker,
    parent: asset.parent ? { id: asset.parent.id, name: asset.parent.name } : null,
    total: asset_total.toNumber(),
    book_value_total: asset.type === asset_type.rupees ? null : book_total.toNumber(),
    price: priceDecimal ? priceDecimal.toNumber() : null,
    xirr: xirr_value,
    breakdown,
    allocation_breakdown,
    line_items,
    value_timeseries,
  }
  return <ClientPage asset={assetForClient} />
}

export default profile('/assets/[id]', Page)
