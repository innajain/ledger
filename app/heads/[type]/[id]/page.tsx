import { notFound } from 'next/navigation'
import { formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import { HeadDetailPage, type HeadData, type LineItem } from '@/app/_components/HeadDetailPage'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { compute_head_rollup, head_detail_link } from '@/app/_utils/subtree_value'
import { HEAD_CONFIG, headBasePath, isHeadType } from '../head_config'
import { get_closing_balance } from './closing_balance'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

type Props = { params: Promise<{ type: string; id: string }> }

export async function generateMetadata({ params }: Props) {
  const { type, id } = await params
  if (!isHeadType(type)) return {}
  const user = await get_current_user()
  if (!user) return { title: HEAD_CONFIG[type].title }
  const head = await prisma.accounting_head.findUnique({ where: { id, user_id: user.id, type }, select: { name: true } })
  return { title: head?.name ?? HEAD_CONFIG[type].title }
}

async function Page({ params }: Props) {
  const { type, id } = await params
  if (!isHeadType(type)) notFound()
  const cfg = HEAD_CONFIG[type]

  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title={cfg.title} />
  }

  const head = await prisma.accounting_head.findUnique({
    where: { id, user_id: user.id, type },
    include: { parent: true },
  })

  if (!head) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{cfg.entityName} not found</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">It may have been deleted, or the link is stale.</p>
      </div>
    )
  }

  const isAccount = type === 'account'

  // One transaction query replaces the old double fetch (head.line_items include plus a
  // re-fetch of the same transactions); the rollup and linked-user lookups are
  // independent, so they run alongside it.
  const [rawTransactions, rollup, linked_user] = await Promise.all([
    prisma.transaction.findMany({
      where: { user_id: user.id, line_items: { some: { accounting_head_id: head.id } } },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    }),
    compute_head_rollup(head.id, user.id),
    isAccount && head.linked_user_id
      ? prisma.user.findUnique({ where: { id: head.linked_user_id }, select: { id: true, username: true, upi_id: true } })
      : null,
  ])

  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  // The head's own line items, rewired to their parent transaction — the same set the
  // old `head.line_items` include produced.
  const head_line_items = rawTransactions.flatMap(tx =>
    tx.line_items.filter(li => li.accounting_head_id === head.id).map(li => ({ ...li, transaction: tx })),
  )

  const uniqueAssets = Array.from(new Map(head_line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  const cashflows: { amount: number; when: Date }[] = []
  const map: Record<string, { asset_id: string; asset_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal; asset_type: asset_type }> =
    {}
  const lineItemsWithValues: (LineItem & { _sortDate: Date })[] = []

  for (const li of head_line_items) {
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
        asset_type: asset.type,
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

  if (isAccount) {
    const remaining_by_id = compute_fifo_remaining(
      lineItemsWithValues
        .filter(li => li.asset_type !== asset_type.rupees)
        .map(li => ({ id: li.id, group_key: li.asset_id!, qty: new Prisma.Decimal(li.quantity), date: li._sortDate })),
    )
    for (const li of lineItemsWithValues) {
      li.remaining_quantity = remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null
    }
  }

  lineItemsWithValues.sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const line_items: LineItem[] = lineItemsWithValues.map(({ _sortDate, ...rest }) => rest)

  const breakdown: HeadData['breakdown'] = []
  for (const e of Object.values(map)) {
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

  let xirr_value: number | null = null
  if (cashflows.length > 0) {
    if (!acc_total.equals(0)) cashflows.push({ amount: acc_total.toNumber(), when: new Date() })
    xirr_value = calculate_xirr(cashflows)
  }

  const { subtree_total, children } = rollup
  const parent: HeadData['parent'] = head.parent ? { name: head.parent.name, link: head_detail_link(head.parent.type, head.parent.id) } : null

  let value_timeseries: HeadData['value_timeseries'] = []
  const has_priced_asset = uniqueAssets.some(a => a.type === 'mf' || a.type === 'etf' || a.type === 'shares')
  if (has_priced_asset) {
    value_timeseries = await compute_value_timeseries(
      rawTransactions,
      isAccount ? { kind: 'account', accounting_head_id: head.id } : { kind: 'allocation', allocation_id: head.id },
      uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
    )
  }

  reconcile_timeseries_tail(value_timeseries, acc_total.toNumber(), xirr_value)

  return (
    <HeadDetailPage
      head={{
        id: head.id,
        name: head.name,
        total: acc_total.toNumber(),
        subtree_total,
        children,
        parent,
        linked_user,
        lock_date: head.lock_date ? formatInTimeZone(head.lock_date, USER_TIMEZONE, 'd MMM yyyy') : null,
        xirr: xirr_value,
        upi_id: linked_user?.upi_id ?? null,
        breakdown,
        line_items,
        value_timeseries,
      }}
      config={{ backLink: headBasePath(type), backText: cfg.backText, entityName: cfg.entityName }}
      closingBalanceAction={type === 'income_expense' ? undefined : get_closing_balance}
      // the reconcile picker only lists real, active accounts — don't offer a link that lands unselectable
      canReconcile={isAccount && head.is_active && !head.is_placeholder}
    />
  )
}

export default profile('/heads/[type]/[id]', Page)
