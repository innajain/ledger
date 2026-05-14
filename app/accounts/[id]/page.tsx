import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import ClientPage from './ClientPage'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries } from '@/app/_utils/value_timeseries'

type Props = { params: Promise<{ id: string }> }

export default async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Account</h1>
        <p>Please log in to view this account.</p>
      </div>
    )
  }

  const account = await prisma.account.findUnique({
    where: { id, user_id: user.id },
    include: {
      line_items: { include: { asset: true, transaction: true } },
      parent: true,
    },
  })

  if (!account) {
    return (
      <div>
        <h1>Account</h1>
        <p>Account not found.</p>
      </div>
    )
  }

  const tx_ids = Array.from(new Set(account.line_items.map(li => li.transaction_id)))
  const rawTransactions = await prisma.transaction.findMany({
    where: { id: { in: tx_ids } },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  const uniqueAssets = Array.from(new Map(account.line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  let book_total = new Prisma.Decimal(0)
  const lineItemsWithValues: {
    id: string
    asset_id: string
    asset_name: string
    quantity: number
    book_value: number | null
    current_value: number
    transaction_id: string
    transaction_date: string
    transaction_description: string | null
    line_item_description: string | null
    asset_type: asset_type
    remaining_quantity: number | null
    _sortDate: Date
  }[] = []
  const cashflows: { amount: number; when: Date }[] = []
  const map: Record<
    string,
    {
      asset_id: string
      asset_name: string
      total_qty: Prisma.Decimal
      total_book: Prisma.Decimal
      type: asset_type
    }
  > = {}

  for (const li of account.line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const book_value = n.book_value!
    const asset = li.asset

    const priceData = priceByAsset.get(asset.id) ?? null
    const priceDecimal = priceData ? new Prisma.Decimal(priceData.price) : null

    let current_value: Prisma.Decimal
    if (asset.type === asset_type.rupees) current_value = qty
    else if (priceDecimal) current_value = priceDecimal.mul(qty)
    else current_value = book_value

    acc_total = acc_total.add(current_value)
    book_total = book_total.add(book_value)

    if (!map[asset.id]) {
      map[asset.id] = {
        asset_id: asset.id,
        asset_name: asset.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
        type: asset.type,
      }
    }
    map[asset.id].total_qty = map[asset.id].total_qty.add(qty)
    map[asset.id].total_book = map[asset.id].total_book.add(book_value)

    cashflows.push({
      amount: -book_value.toNumber(),
      when: li.datetime ?? li.transaction.datetime,
    })

    lineItemsWithValues.push({
      id: li.id,
      asset_id: asset.id,
      asset_name: asset.name,
      quantity: qty.toNumber(),
      book_value: book_value.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
      asset_type: asset.type,
      remaining_quantity: null,
      _sortDate: li.datetime ?? li.transaction.datetime,
    })
  }

  // FIFO per asset within this account: a sell consumes from the oldest open
  // buy lot of the same asset. Only computed for non-rupees assets.
  const remaining_by_id = new Map<string, Prisma.Decimal>()
  const chrono = [...lineItemsWithValues]
    .filter(li => li.asset_type !== asset_type.rupees)
    .sort((a, b) => {
      const cmp = a._sortDate.getTime() - b._sortDate.getTime()
      if (cmp !== 0) return cmp
      // Same instant: process buys before sells.
      return b.quantity - a.quantity
    })
  const open_lots_by_asset = new Map<string, { id: string; remaining: Prisma.Decimal }[]>()
  for (const item of chrono) {
    const aid = item.asset_id
    if (!open_lots_by_asset.has(aid)) open_lots_by_asset.set(aid, [])
    const open_lots = open_lots_by_asset.get(aid)!
    const qty = new Prisma.Decimal(item.quantity)
    if (qty.greaterThan(0)) {
      open_lots.push({ id: item.id, remaining: qty })
      remaining_by_id.set(item.id, qty)
    } else if (qty.lessThan(0)) {
      let to_consume = qty.neg()
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
  for (const li of lineItemsWithValues) {
    li.remaining_quantity = remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null
  }

  // Sort line items by datetime (line item datetime or transaction datetime), new to old
  lineItemsWithValues.sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sortedLineItems = lineItemsWithValues.map(({ _sortDate, ...rest }) => rest)

  const breakdown: {
    asset_id: string
    asset_name: string
    quantity: number
    book_value: number | null
    current_value: number
    asset_type: asset_type
  }[] = []
  for (const k of Object.keys(map)) {
    const e = map[k]
    if (e.total_qty.equals(0)) continue

    const priceData = priceByAsset.get(e.asset_id) ?? null
    let current_value: Prisma.Decimal
    if (e.type === asset_type.rupees) current_value = e.total_qty
    else if (priceData) current_value = new Prisma.Decimal(priceData.price).mul(e.total_qty)
    else current_value = e.total_book

    breakdown.push({
      asset_id: e.asset_id,
      asset_name: e.asset_name,
      quantity: e.total_qty.toNumber(),
      book_value: e.total_book.toNumber(),
      current_value: current_value.toNumber(),
      asset_type: e.type,
    })
  }

  let xirr_value: number | null = null
  if (cashflows.length > 0) {
    if (!acc_total.equals(0)) {
      cashflows.push({ amount: acc_total.toNumber(), when: new Date() })
    }
    xirr_value = calculate_xirr(cashflows)
  }

  // Show timeseries only for real accounts that hold at least one priced asset (mf/etf/shares).
  const has_priced_asset = uniqueAssets.some(a => a.type === 'mf' || a.type === 'etf' || a.type === 'shares')
  const value_timeseries =
    account.type === 'real' && has_priced_asset
      ? await compute_value_timeseries(
          rawTransactions,
          { kind: 'account', account_id: account.id },
          uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
        )
      : []

  const accountForClient = {
    id: account.id,
    name: account.name,
    type: account.type,
    parent: account.parent ? { id: account.parent.id, name: account.parent.name } : null,
    total: acc_total.toNumber(),
    book_value_total: book_total.toNumber(),
    xirr: xirr_value,
    breakdown,
    line_items: sortedLineItems,
    value_timeseries,
  }
  return <ClientPage account={accountForClient} />
}
