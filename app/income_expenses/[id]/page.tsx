import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import ClientPage from './ClientPage'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { fetch_and_normalize_transactions } from '@/app/_utils/fetch_transactions'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Nominal Account</h1>
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

  if (!account || account.type !== 'nominal') {
    return (
      <div>
        <h1>Nominal Account</h1>
        <p>Account not found.</p>
      </div>
    )
  }

  const { normalizedById } = await fetch_and_normalize_transactions(account.line_items)
  const uniqueAssets = Array.from(new Map(account.line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  let book_total = new Prisma.Decimal(0)
  const map: Record<string, { asset_id: string; asset_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal; asset_type: asset_type }> =
    {}
  const lineItemsWithValues: {
    id: string
    asset_id: string
    asset_name: string
    asset_type: asset_type
    quantity: number
    txn_value: number | null
    current_value: number
    transaction_id: string
    transaction_date: string
    transaction_description: string | null
    line_item_description: string | null
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

    if (!map[asset.id])
      map[asset.id] = {
        asset_id: asset.id,
        asset_name: asset.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
        asset_type: asset.type,
      }
    map[asset.id].total_qty = map[asset.id].total_qty.add(qty)
    map[asset.id].total_book = map[asset.id].total_book.add(txn_value)

    lineItemsWithValues.push({
      id: li.id,
      asset_id: asset.id,
      asset_name: asset.name,
      asset_type: asset.type,
      quantity: qty.toNumber(),
      txn_value: txn_value.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
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
  for (const e of Object.values(map)) {
    book_total = book_total.add(e.total_book)
    if (e.total_qty.equals(0)) continue
    const priceData = priceByAsset.get(e.asset_id) ?? null
    const current_value = compute_current_value(e.asset_type, e.total_qty, priceData ? new Prisma.Decimal(priceData.price) : null, e.total_book)
    breakdown.push({
      asset_id: e.asset_id,
      asset_name: e.asset_name,
      quantity: e.total_qty.toNumber(),
      txn_value: e.total_book.toNumber(),
      current_value: current_value.toNumber(),
      asset_type: e.asset_type,
    })
  }

  return (
    <ClientPage
      account={{
        id: account.id,
        name: account.name,
        type: account.type,
        parent: account.parent ? { id: account.parent.id, name: account.parent.name } : null,
        total: acc_total.toNumber(),
        txn_value_total: book_total.toNumber(),
        breakdown,
        line_items: sortedLineItems,
      }}
    />
  )
}

export default profile('/income_expenses/[id]', Page)
