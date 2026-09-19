import { cache } from 'react'
import { notFound } from 'next/navigation'
import { formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { accounting_head_type, asset_type, Prisma } from '@/generated/prisma/client'
import { HeadDetailPage, type HeadData, type LineItem } from '@/app/_components/HeadDetailPage'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE, is_future_txn_due } from '@/app/_utils/future_txn'
import { compute_future_sufficiency } from '@/app/_utils/future_balance'
import { compute_head_rollup, head_detail_link, load_subtree_head_ids } from '@/app/_utils/subtree_value'
import { HEAD_CONFIG, headBasePath, isHeadType } from '../head_config'
import { get_closing_balance } from './closing_balance'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

type Props = {
  params: Promise<{ type: string; id: string }>
  searchParams?: Promise<{ scope?: string }>
}

// Which heads the page reports on. 'self' is this head alone (the default, and what the
// page has always shown); 'subtree' widens every figure on the page — totals, holdings,
// line items, XIRR, chart, future transactions, balance-on-a-date — to the head plus its
// descendants. It rides in the URL so the view is shareable and the server can scope the
// queries instead of shipping both datasets to the browser.
export type HeadScope = 'self' | 'subtree'

// react.cache so generateMetadata and the page share one fetch per request.
const get_head_row = cache((id: string, user_id: string, type: accounting_head_type) =>
  prisma.accounting_head.findUnique({ where: { id, user_id, type }, include: { parent: true } }),
)

export async function generateMetadata({ params }: Props) {
  const { type, id } = await params
  if (!isHeadType(type)) return {}
  const user = await get_current_user()
  if (!user) return { title: HEAD_CONFIG[type].title }
  const head = await get_head_row(id, user.id, type)
  return { title: head?.name ?? HEAD_CONFIG[type].title }
}

async function Page({ params, searchParams }: Props) {
  const { type, id } = await params
  const requested_scope: HeadScope = (await searchParams)?.scope === 'subtree' ? 'subtree' : 'self'
  if (!isHeadType(type)) notFound()
  const cfg = HEAD_CONFIG[type]

  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title={cfg.title} />
  }

  const head = await get_head_row(id, user.id, type)

  if (!head) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{cfg.entityName} not found</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">It may have been deleted, or the link is stale.</p>
      </div>
    )
  }

  const isAccount = type === 'account'

  // The heads every query below is scoped to. Only the subtree view pays for the extra
  // lookup; the default view knows its one id without touching the DB. A head with no
  // descendants collapses back to the self view — a hand-typed ?scope=subtree on a leaf
  // should render the ordinary page, not an "including sub-heads" one that includes none.
  const scoped_head_ids = requested_scope === 'subtree' ? await load_subtree_head_ids(head.id, user.id) : new Set([head.id])
  const scope: HeadScope = scoped_head_ids.size > 1 ? 'subtree' : 'self'
  const scoped_id_filter = { accounting_head_id: { in: [...scoped_head_ids] } }

  // One transaction query replaces the old double fetch (head.line_items include plus a
  // re-fetch of the same transactions); the rollup and linked-user lookups are
  // independent, so they run alongside it.
  const [rawTransactions, futureTransactions, rollup, linked_user] = await Promise.all([
    prisma.transaction.findMany({
      where: { user_id: user.id, ...NOT_FUTURE, line_items: { some: scoped_id_filter } },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    }),
    prisma.transaction.findMany({
      where: { user_id: user.id, is_future: true, line_items: { some: scoped_id_filter } },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
      orderBy: { datetime: 'asc' },
    }),
    compute_head_rollup(head.id, user.id),
    isAccount && head.linked_user_id
      ? prisma.user.findUnique({ where: { id: head.linked_user_id }, select: { id: true, username: true, upi_id: true } })
      : null,
  ])

  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  // The line items in scope, rewired to their parent transaction — this head's own in
  // the default view, the whole subtree's in the "including sub-heads" one.
  const head_line_items = rawTransactions.flatMap(tx =>
    tx.line_items.filter(li => scoped_head_ids.has(li.accounting_head_id)).map(li => ({ ...li, transaction: tx })),
  )

  const uniqueAssets = Array.from(new Map(head_line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  // Book value — what the transactions actually recorded, never marked to market. Summed
  // over every line item (not just the assets left in `map`), so a fully exited holding
  // still contributes its realized cost the way acc_total does.
  let book_total = new Prisma.Decimal(0)
  // The same two figures for the root head alone. In the subtree view they back the
  // "this one only" comparison row, computed from the very line items the page is
  // already walking rather than a second rollup, so the two numbers can never disagree.
  let own_total = new Prisma.Decimal(0)
  let own_book = new Prisma.Decimal(0)
  const cashflows: { amount: number; when: Date }[] = []
  const map: Record<string, { asset_id: string; asset_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal; asset_type: asset_type }> =
    {}
  const lineItemsWithValues: (LineItem & { _sortDate: Date })[] = []
  // Decimal-precision copy of each line item's lot, for the FIFO pass below —
  // lineItemsWithValues has already been flattened to numbers for the client.
  const lots: { id: string; head_id: string; asset_id: string; asset_type: asset_type; qty: Prisma.Decimal; book: Prisma.Decimal; date: Date }[] = []

  for (const li of head_line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const txn_value = n.txn_value!
    const asset = li.asset
    const priceDecimal = (priceByAsset.get(asset.id) ?? null) && new Prisma.Decimal(priceByAsset.get(asset.id)!.price)
    const current_value = compute_current_value(asset.type, qty, priceDecimal, txn_value)

    acc_total = acc_total.add(current_value)
    book_total = book_total.add(txn_value)
    if (li.accounting_head_id === head.id) {
      own_total = own_total.add(current_value)
      own_book = own_book.add(txn_value)
    }
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
      // Which head the line actually sits on. Only rendered in the subtree view, where a
      // row's own head is no longer implied by the page you are on.
      head_name: scope === 'subtree' ? li.accounting_head.name : null,
      head_link: scope === 'subtree' ? head_detail_link(li.accounting_head.type, li.accounting_head_id) : null,
      _sortDate: li.datetime ?? li.transaction.datetime,
    })
    lots.push({
      id: li.id,
      head_id: li.accounting_head_id,
      asset_id: asset.id,
      asset_type: asset.type,
      qty,
      book: txn_value,
      date: li.datetime ?? li.transaction.datetime,
    })
  }

  // FIFO one queue per head *and* asset: which buy lots are still open. Keying on the
  // head as well matters in the subtree view — units bought in one sub-account are not
  // the units sold from a sibling, and a shared queue would close the wrong lots. In the
  // default view every line shares one head, so the key is the asset as before. Feeds the
  // per-row remaining badge (accounts only, as before) and the invested total below.
  const remaining_by_id = compute_fifo_remaining(
    lots.filter(l => l.asset_type !== asset_type.rupees).map(l => ({ id: l.id, group_key: `${l.head_id}|${l.asset_id}`, qty: l.qty, date: l.date })),
  )

  if (isAccount) {
    for (const li of lineItemsWithValues) {
      li.remaining_quantity = remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null
    }
  }

  // Invested — the cost basis of what the head still holds, the same measure the asset
  // page calls "Current investment": open lots at their own purchase cost, prorated when
  // a lot is part-sold, plus rupees at face value (cash's cost basis is itself). It
  // parts ways with book value only once units are sold, because book keeps the
  // proceeds-vs-cost difference of the closed lots — a fully exited holding leaves its
  // realized gain sitting in book while contributing nothing here.
  let invested_total = new Prisma.Decimal(0)
  let holds_non_rupees = false
  for (const lot of lots) {
    if (lot.asset_type === asset_type.rupees) {
      invested_total = invested_total.add(lot.book)
      continue
    }
    holds_non_rupees = true
    if (!lot.qty.greaterThan(0)) continue
    const remaining = remaining_by_id.get(lot.id)
    if (remaining && remaining.greaterThan(0)) invested_total = invested_total.add(lot.book.mul(remaining).div(lot.qty))
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

  const { subtree_total, subtree_book, children } = rollup
  const parent: HeadData['parent'] = head.parent ? { name: head.parent.name, link: head_detail_link(head.parent.type, head.parent.id) } : null

  // undefined in the default view so the frozen cache still applies there; only the
  // subtree series opts out of caching (see compute_value_timeseries).
  const subtree_head_id_list = scope === 'subtree' ? [...scoped_head_ids] : undefined

  let value_timeseries: HeadData['value_timeseries'] = []
  const has_priced_asset = uniqueAssets.some(a => a.type === 'mf' || a.type === 'etf' || a.type === 'shares')
  if (has_priced_asset) {
    value_timeseries = await compute_value_timeseries(
      transactions,
      isAccount
        ? { kind: 'account', accounting_head_id: head.id, head_ids: subtree_head_id_list }
        : { kind: 'allocation', allocation_id: head.id, head_ids: subtree_head_id_list },
      uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
    )
  }

  reconcile_timeseries_tail(value_timeseries, acc_total.toNumber(), xirr_value)

  // Future transactions section: one row per line item in scope (not per transaction —
  // a transaction with two lines here, e.g. rent + brokerage against the same account,
  // shows as two rows), each with a sufficiency badge for whether there will be enough
  // balance when it lands (walked in effective-datetime order, cumulative, starting from
  // the current real balance). In the subtree view the walk runs on the combined
  // per-asset balance, so the badge answers "will the group cover this", not "will this
  // one sub-head". A line item already dated in the past is overdue rather than
  // forward-looking, so it's excluded from the walk entirely (see
  // compute_future_sufficiency).
  const normalized_future = futureTransactions.map(normalize_txn)
  const future_line_items = normalized_future
    .flatMap(tx =>
      tx.line_items
        .filter(li => scoped_head_ids.has(li.accounting_head_id))
        .map(li => ({
          id: li.id,
          transaction_id: tx.id,
          datetime: li.datetime ?? tx.datetime,
          description: tx.description,
          asset_id: li.asset_id,
          quantity: li.quantity,
          txn_value: li.txn_value,
        })),
    )
    .sort((a, b) => a.datetime.getTime() - b.datetime.getTime())
  // Asset names for the "balance after" display — read straight off the future
  // transactions' own (normalized) line items, so it covers assets this head has never
  // held in real history yet, not just the ones already in `map`.
  const future_asset_names = new Map<string, string>()
  for (const tx of normalized_future) for (const li of tx.line_items) future_asset_names.set(li.asset_id, li.asset.name)

  let future_transactions_for_client: HeadData['future_transactions'] = []
  if (future_line_items.length > 0) {
    // One `now` for every row, so two either side of an IST midnight can't disagree
    // about what "today" is (same rule as the home card and the transactions list).
    const now = new Date()
    const current_balances = new Map<string, Prisma.Decimal>()
    for (const e of Object.values(map)) current_balances.set(e.asset_id, e.total_qty)
    future_transactions_for_client = compute_future_sufficiency(current_balances, future_line_items).map(r => ({
      id: r.id,
      transaction_id: r.transaction_id,
      datetime: r.datetime,
      description: r.description,
      amount: r.amount,
      due: is_future_txn_due(r.datetime, now),
      sufficient: r.sufficient,
      balance_after: r.balance_after === null ? null : { asset_name: future_asset_names.get(r.asset_id) ?? r.asset_id, balance: r.balance_after },
    }))
  }

  return (
    <HeadDetailPage
      head={{
        id: head.id,
        name: head.name,
        // Everything below is scoped: in the subtree view these already cover the head
        // and its descendants, which is why the rollup rows drop out there.
        total: acc_total.toNumber(),
        book_total: book_total.toNumber(),
        // Cost figures only say something on a head that holds priced assets; on a
        // rupees-only one they'd both just restate the balance.
        invested_total: holds_non_rupees ? invested_total.toNumber() : null,
        // The head on its own — the comparison row in the subtree view, and the basis
        // for anything that settles against this head alone (UPI, "you owe"), which a
        // subtree total would overstate.
        own_total: own_total.toNumber(),
        own_book: own_book.toNumber(),
        // Cached-balance rollup, shown only in the default view. In the subtree view the
        // headline figures are the rollup, computed live from the same line items the
        // rest of the page lists — printing the cached pair beside them would invite a
        // rounding-level disagreement between two numbers that mean the same thing.
        subtree_total: scope === 'subtree' ? null : subtree_total,
        subtree_book: scope === 'subtree' ? null : subtree_book,
        children,
        parent,
        linked_user,
        lock_date: head.lock_date ? formatInTimeZone(head.lock_date, USER_TIMEZONE, 'd MMM yyyy') : null,
        xirr: xirr_value,
        upi_id: linked_user?.upi_id ?? null,
        breakdown,
        line_items,
        value_timeseries,
        future_transactions: future_transactions_for_client,
      }}
      config={{ backLink: headBasePath(type), backText: cfg.backText, entityName: cfg.entityName, subEntityLabel: cfg.subEntityLabel }}
      scope={scope}
      closingBalanceAction={type === 'income_expense' ? undefined : get_closing_balance}
      // the reconcile picker only lists real, active accounts — don't offer a link that lands unselectable
    />
  )
}

export default profile('/heads/[type]/[id]', Page)
