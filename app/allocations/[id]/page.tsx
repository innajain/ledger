import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
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
        <h1>Allocation</h1>
        <p>Please log in to view this allocation.</p>
      </div>
    )
  }

  const allocation = await prisma.account.findUnique({
    where: { id, user_id: user.id, type: 'allocation' },
    include: {
      line_items: { include: { asset: true, transaction: true } },
      parent: true,
    },
  })

  if (!allocation) {
    return (
      <div>
        <h1>Allocation</h1>
        <p>Allocation not found.</p>
      </div>
    )
  }

  const tx_ids = Array.from(new Set(allocation.line_items.map(li => li.transaction_id)))
  const rawTransactions = await prisma.transaction.findMany({
    where: { id: { in: tx_ids } },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  const uniqueAssets = Array.from(new Map(allocation.line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  let book_total = new Prisma.Decimal(0)
  const lineItemsWithValues: {
    id: string
    asset_id?: string
    asset_name: string
    quantity: number
    txn_value: number | null
    current_value: number
    transaction_id: string
    transaction_date: string
    transaction_description: string | null
    line_item_description: string | null
    asset_type: asset_type
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
      asset_type: asset_type
    }
  > = {}

  for (const li of allocation.line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const txn_value = n.txn_value!
    const asset = li.asset

    const priceData = priceByAsset.get(asset.id) ?? null
    const priceDecimal = priceData ? new Prisma.Decimal(priceData.price) : null

    let current_value: Prisma.Decimal
    if (asset.type === asset_type.rupees) current_value = qty
    else if (priceDecimal) current_value = priceDecimal.mul(qty)
    else current_value = txn_value

    acc_total = acc_total.add(current_value)

    if (!map[asset.id]) {
      map[asset.id] = {
        asset_id: asset.id,
        asset_name: asset.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
        asset_type: asset.type,
      }
    }
    map[asset.id].total_qty = map[asset.id].total_qty.add(qty)
    map[asset.id].total_book = map[asset.id].total_book.add(txn_value)

    cashflows.push({
      amount: -txn_value.toNumber(),
      when: li.datetime ?? li.transaction.datetime,
    })

    lineItemsWithValues.push({
      id: li.id,
      asset_id: asset.id,
      asset_name: asset.name,
      quantity: qty.toNumber(),
      txn_value: txn_value.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
      asset_type: asset.type,
      _sortDate: li.datetime ?? li.transaction.datetime,
    })
  }

  lineItemsWithValues.sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sortedLineItems = lineItemsWithValues.map(({ _sortDate, ...rest }) => rest)

  const breakdown: {
    asset_id: string
    asset_name: string
    quantity: number
    txn_value: number | null
    current_value: number
    asset_type: asset_type
  }[] = []
  for (const k of Object.keys(map)) {
    const e = map[k]
    book_total = book_total.add(e.total_book)

    if (e.total_qty.equals(0)) continue

    const priceData = priceByAsset.get(e.asset_id) ?? null
    let current_value: Prisma.Decimal
    if (e.asset_type === asset_type.rupees) current_value = e.total_qty
    else if (priceData) current_value = new Prisma.Decimal(priceData.price).mul(e.total_qty)
    else current_value = e.total_book

    breakdown.push({
      asset_id: e.asset_id,
      asset_name: e.asset_name,
      quantity: e.total_qty.toNumber(),
      txn_value: e.total_book.toNumber(),
      current_value: current_value.toNumber(),
      asset_type: e.asset_type,
    })
  }

  let xirr_value: number | null = null
  if (cashflows.length > 0) {
    if (!acc_total.equals(0)) {
      cashflows.push({ amount: acc_total.toNumber(), when: new Date() })
    }
    xirr_value = calculate_xirr(cashflows)
  }

  const has_priced_asset = uniqueAssets.some(a => a.type === 'mf' || a.type === 'etf' || a.type === 'shares')
  const value_timeseries = has_priced_asset
    ? await compute_value_timeseries(
        rawTransactions,
        { kind: 'allocation', allocation_id: allocation.id },
        uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
      )
    : []

  // Reconcile today's chart point with the live values used in the InfoCard.
  if (value_timeseries.length > 0) {
    const last = value_timeseries[value_timeseries.length - 1]
    last.current = acc_total.toNumber()
    last.xirr = xirr_value
  }

  const allocationForClient = {
    id: allocation.id,
    name: allocation.name,
    type: allocation.type,
    parent: allocation.parent ? { id: allocation.parent.id, name: allocation.parent.name } : null,
    total: acc_total.toNumber(),
    txn_value_total: book_total.toNumber(),
    xirr: xirr_value,
    line_items: sortedLineItems,
    breakdown,
    value_timeseries,
  }

  return <ClientPage allocation={allocationForClient} />
}

export default profile('/allocations/[id]', Page)
