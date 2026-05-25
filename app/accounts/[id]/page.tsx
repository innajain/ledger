import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import ClientPage from './ClientPage'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { fetch_and_normalize_transactions } from '@/app/_utils/fetch_transactions'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
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

  const account = await prisma.accounting_head.findUnique({
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

  const { rawTransactions, normalizedById } = await fetch_and_normalize_transactions(account.line_items)
  const uniqueAssets = Array.from(new Map(account.line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  const cashflows: { amount: number; when: Date }[] = []
  const map: Record<string, { asset_id: string; asset_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal; type: asset_type }> = {}
  const lineItemsWithValues: {
    id: string
    asset_id: string
    asset_name: string
    quantity: number
    txn_value: number | null
    current_value: number
    transaction_id: string
    transaction_date: string
    transaction_description: string | null
    line_item_description: string | null
    asset_type: asset_type
    remaining_quantity: number | null
    _sortDate: Date
  }[] = []

  for (const li of account.line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const txn_value = n.txn_value!
    const asset = li.asset
    const priceDecimal = (priceByAsset.get(asset.id) ?? null) && new Prisma.Decimal(priceByAsset.get(asset.id)!.price)
    const current_value = compute_current_value(asset.type, qty, priceDecimal, txn_value)

    acc_total = acc_total.add(current_value)
    cashflows.push({ amount: -txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime })

    if (!map[asset.id])
      map[asset.id] = {
        asset_id: asset.id,
        asset_name: asset.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
        type: asset.type,
      }
    map[asset.id].total_qty = map[asset.id].total_qty.add(qty)
    map[asset.id].total_book = map[asset.id].total_book.add(txn_value)

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
      remaining_quantity: null,
      _sortDate: li.datetime ?? li.transaction.datetime,
    })
  }

  // FIFO per asset (non-rupees only)
  const remaining_by_id = compute_fifo_remaining(
    lineItemsWithValues
      .filter(li => li.asset_type !== asset_type.rupees)
      .map(li => ({ id: li.id, group_key: li.asset_id, qty: new Prisma.Decimal(li.quantity), date: li._sortDate })),
  )

  for (const li of lineItemsWithValues) {
    li.remaining_quantity = remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null
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
  for (const e of Object.values(map)) {
    if (e.total_qty.equals(0)) continue
    const priceData = priceByAsset.get(e.asset_id) ?? null
    const current_value = compute_current_value(e.type, e.total_qty, priceData ? new Prisma.Decimal(priceData.price) : null, e.total_book)
    breakdown.push({
      asset_id: e.asset_id,
      asset_name: e.asset_name,
      quantity: e.total_qty.toNumber(),
      txn_value: e.total_book.toNumber(),
      current_value: current_value.toNumber(),
      asset_type: e.type,
    })
  }

  let xirr_value: number | null = null
  if (cashflows.length > 0) {
    if (!acc_total.equals(0)) cashflows.push({ amount: acc_total.toNumber(), when: new Date() })
    xirr_value = calculate_xirr(cashflows)
  }

  const has_priced_asset = uniqueAssets.some(a => a.type === 'mf' || a.type === 'etf' || a.type === 'shares')
  const value_timeseries =
    account.type === 'account' && has_priced_asset
      ? await compute_value_timeseries(
          rawTransactions,
          { kind: 'account', accounting_head_id: account.id },
          uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
        )
      : []

  reconcile_timeseries_tail(value_timeseries, acc_total.toNumber(), xirr_value)

  return (
    <ClientPage
      account={{
        id: account.id,
        name: account.name,
        total: acc_total.toNumber(),
        xirr: xirr_value,
        upi_id: account.upi_id,
        breakdown,
        line_items: sortedLineItems,
        value_timeseries,
      }}
    />
  )
}

export default profile('/accounts/[id]', Page)
