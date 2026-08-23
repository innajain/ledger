import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import ClientPage from './ClientPage'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { fetch_and_normalize_transactions } from '@/app/_utils/fetch_transactions'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title="Assets" />
  }
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { is_admin: true } })
  const isAdmin = me?.is_admin ?? false

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      line_items: { where: { transaction: { user_id: user.id } }, include: { accounting_head: true, transaction: true } },
      parent: true,
      children: true,
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

  const { rawTransactions, normalizedById } = await fetch_and_normalize_transactions(asset.line_items)

  const real_line_items = asset.line_items.filter(li => li.accounting_head.type === 'account')
  const allocation_line_items = asset.line_items.filter(li => li.accounting_head.type === 'allocation')

  const priceResp = await get_price_for_asset(asset.type, asset.ticker ?? null)
  const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null

  let asset_total = new Prisma.Decimal(0)
  let book_total = new Prisma.Decimal(0)
  const acc_map: Record<string, { accounting_head_id: string; account_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal }> = {}
  for (const li of real_line_items) {
    const n = normalizedById.get(li.id)!
    const aid = li.accounting_head.id
    if (!acc_map[aid])
      acc_map[aid] = {
        accounting_head_id: aid,
        account_name: li.accounting_head.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
      }
    acc_map[aid].total_qty = acc_map[aid].total_qty.add(n.quantity!)
    acc_map[aid].total_book = acc_map[aid].total_book.add(n.txn_value!)
  }

  const breakdown: { accounting_head_id: string; account_name: string; quantity: number; txn_value: number | null; current_value: number }[] = []
  for (const entry of Object.values(acc_map)) {
    book_total = book_total.add(entry.total_book)
    if (entry.total_qty.equals(0)) continue
    const current_value = compute_current_value(asset.type, entry.total_qty, priceDecimal, entry.total_book)
    asset_total = asset_total.add(current_value)
    breakdown.push({
      accounting_head_id: entry.accounting_head_id,
      account_name: entry.account_name,
      quantity: entry.total_qty.toNumber(),
      txn_value: entry.total_book.toNumber(),
      current_value: current_value.toNumber(),
    })
  }

  const alloc_map: Record<string, { allocation_id: string; allocation_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal }> = {}
  for (const li of allocation_line_items) {
    const n = normalizedById.get(li.id)!
    const aid = li.accounting_head.id
    if (!alloc_map[aid])
      alloc_map[aid] = {
        allocation_id: aid,
        allocation_name: li.accounting_head.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
      }
    alloc_map[aid].total_qty = alloc_map[aid].total_qty.add(n.quantity!)
    alloc_map[aid].total_book = alloc_map[aid].total_book.add(n.txn_value!)
  }

  const allocation_breakdown: {
    allocation_id: string
    allocation_name: string
    quantity: number
    txn_value: number | null
    current_value: number
  }[] = []
  for (const entry of Object.values(alloc_map)) {
    if (entry.total_qty.equals(0)) continue
    const current_value = compute_current_value(asset.type, entry.total_qty, priceDecimal, entry.total_book)
    allocation_breakdown.push({
      allocation_id: entry.allocation_id,
      allocation_name: entry.allocation_name,
      quantity: entry.total_qty.toNumber(),
      txn_value: asset.type === asset_type.rupees ? null : entry.total_book.toNumber(),
      current_value: current_value.toNumber(),
    })
  }

  const items_with_meta = real_line_items.map(li => {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const book = n.txn_value!
    return {
      li,
      qty,
      book,
      current_value: compute_current_value(asset.type, qty, priceDecimal, book),
      sortDate: li.datetime ?? li.transaction.datetime,
    }
  })

  const remaining_by_id =
    asset.type !== asset_type.rupees
      ? compute_fifo_remaining(
          items_with_meta.map(item => ({ id: item.li.id, group_key: item.li.accounting_head.id, qty: item.qty, date: item.sortDate })),
        )
      : new Map<string, Prisma.Decimal>()

  let current_investment = new Prisma.Decimal(0)
  for (const { li, qty, book } of items_with_meta) {
    if (qty.greaterThan(0)) {
      const remaining = remaining_by_id.get(li.id) ?? new Prisma.Decimal(0)
      if (remaining.greaterThan(0)) current_investment = current_investment.add(book.mul(remaining).div(qty))
    }
  }

  const line_items = items_with_meta
    .map(({ li, qty, book, current_value, sortDate }) => ({
      id: li.id,
      accounting_head_id: li.accounting_head.id,
      account_name: li.accounting_head.name,
      quantity: qty.toNumber(),
      txn_value: book.toNumber(),
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
    const cashflows = real_line_items.map(li => ({
      amount: -normalizedById.get(li.id)!.txn_value!.toNumber(),
      when: li.datetime ?? li.transaction.datetime,
    }))
    if (!asset_total.equals(0)) cashflows.push({ amount: asset_total.toNumber(), when: new Date() })
    xirr_value = calculate_xirr(cashflows)
  }

  const has_priced_asset = asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares'
  const value_timeseries = has_priced_asset
    ? await compute_value_timeseries(rawTransactions, { kind: 'asset', asset_id: asset.id }, [
        { id: asset.id, type: asset.type, ticker: asset.ticker },
      ])
    : []

  reconcile_timeseries_tail(value_timeseries, asset_total.toNumber(), xirr_value)

  return (
    <ClientPage
      asset={{
        id: asset.id,
        name: asset.name,
        type: asset.type,
        ticker: asset.ticker,
        parent: asset.parent ? { id: asset.parent.id, name: asset.parent.name } : null,
        children: asset.children.map(c => ({ id: c.id, name: c.name })),
        total: asset_total.toNumber(),
        txn_value_total: asset.type === asset_type.rupees ? null : book_total.toNumber(),
        current_investment: asset.type === asset_type.rupees ? null : current_investment.toNumber(),
        price: priceDecimal ? priceDecimal.toNumber() : null,
        xirr: xirr_value,
        breakdown,
        allocation_breakdown,
        line_items,
        value_timeseries,
      }}
      isAdmin={isAdmin}
    />
  )
}

export default profile('/assets/[id]', Page)
