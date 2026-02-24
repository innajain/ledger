import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset, get_latest_etf_or_shares_price } from '@/app/_utils/price_fetcher'
import ClientPage from './ClientPage'
import { asset_type, Prisma } from '@/generated/prisma/client'
import { delete_transaction } from '@/app/_actions/transactions'
import { get_line_item_qty } from '@/app/_utils/validate_line_items'

type Props = { params: Promise<{ id: string }> }

export default async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return <div>Please log in.</div>

  const tx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } } },
  })
  if (!tx) return <div>Transaction not found.</div>

  // compute total book value (match transactions list: sum of nominal line_items book_value or quantity, negated)
  let total_book = new Prisma.Decimal(0)
  const items = [] as {
    id: string
    account_id: string
    account_name: string
    account_type: string
    asset_id: string
    asset_name: string
    asset_type: asset_type
    quantity: number | null
    book_value: number | null
    current_value: number
    description: string | null
    datetime: Date | null
  }[]
  for (const li of tx.line_items) {
    const qty = get_line_item_qty({ ...li, transaction: tx })
    const asset = li.asset
    let current_value = new Prisma.Decimal(0)

    if (asset.type === 'mf') {
      const nav = await get_price_for_asset(asset.type, asset.ticker ?? null)
      if (nav) current_value = new Prisma.Decimal(nav.price).mul(qty)
      else current_value = li.book_value!
    } else if (asset.type === 'etf') {
      const p = await get_price_for_asset(asset.type, asset.ticker ?? null)
      if (p) current_value = new Prisma.Decimal(p.price).mul(qty)
      else current_value = li.book_value!
    } else if (asset.type === 'shares') {
      const p = await get_latest_etf_or_shares_price(asset.ticker ?? '')
      if (p) current_value = new Prisma.Decimal(p.close).mul(qty)
      else current_value = li.book_value!
    } else if (asset.type === asset_type.rupees) {
      current_value = qty
    } else {
      current_value = li.book_value!
    }

    // accumulate nominal book value for transaction total_book
    total_book = total_book.add(li.account.type === 'real' ? (li.book_value ?? qty) : new Prisma.Decimal(0))

    items.push({
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      account_type: li.account.type,
      asset_id: asset.id,
      asset_name: asset.name,
      asset_type: asset.type,
      quantity: li.quantity === null ? null : li.quantity.toNumber(),
      book_value: li.book_value ? li.book_value.toNumber() : null,
      current_value: current_value.toNumber(),
      description: li.description,
      datetime: li.datetime,
    })
  }

  const txForClient = {
    id: tx.id,
    date: tx.datetime.toISOString(),
    description: tx.description,
    total: total_book.toNumber(),
    line_items: items,
  }

  return <ClientPage transaction={txForClient} deleteTransaction={delete_transaction} />
}
