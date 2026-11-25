import { cache } from 'react'
import { notFound } from 'next/navigation'
import { formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { accounting_head_type, Prisma } from '@/generated/prisma/client'
import { HeadDetailPage, type HeadData } from '@/app/_components/HeadDetailPage'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { LINE_ITEMS_PAGE } from '@/app/_utils/line_item_paging'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { is_future_txn_due } from '@/app/_utils/future_txn'
import { compute_future_sufficiency } from '@/app/_utils/future_balance'
import { compute_head_rollup, head_detail_link, load_subtree_head_ids } from '@/app/_utils/subtree_value'
import { HEAD_CONFIG, headBasePath, isHeadType } from '../head_config'
import { get_closing_balance } from './closing_balance'
import { head_txn_select, load_head_line_items } from './head_line_items'
import { get_more_head_line_items } from './more_line_items'
import { get_expected_interest, save_interest_settings } from './expected_interest'
import { parse_saved_interest_settings } from '@/app/_utils/interest_config'
import { ist_ymd } from '@/app/_utils/ist_date'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'
import { NotFound } from '@/app/_components/NotFound'

type Props = {
  params: Promise<{ type: string; id: string }>
  searchParams?: Promise<{ scope?: string }>
}

// Which heads the page reports on. 'self' is this head alone; 'subtree' widens every
// figure on the page — totals, holdings, line items, XIRR, chart, future transactions,
// balance-on-a-date — to the head plus its descendants. It rides in the URL so the view is
// shareable and the server can scope the queries instead of shipping both datasets to the
// browser. With no ?scope= the page opens on default_scope below.
export type HeadScope = 'self' | 'subtree'

// A parent that holds nothing itself — its money sits in its children — opens on the
// subtree view, because its own view is ₹0 over an empty holdings grid and an empty
// line-items list. Every other head opens on itself. Two indexed lookups, both by head id
// (already scoped to the user by the head fetch).
async function default_scope(head_id: string, user_id: string): Promise<HeadScope> {
  const [child, own_line] = await Promise.all([
    prisma.accounting_head.findFirst({ where: { parent_id: head_id, user_id }, select: { id: true } }),
    prisma.line_item.findFirst({ where: { accounting_head_id: head_id }, select: { id: true } }),
  ])
  return child && !own_line ? 'subtree' : 'self'
}

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
  const scope_param = (await searchParams)?.scope
  if (!isHeadType(type)) notFound()
  const cfg = HEAD_CONFIG[type]

  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title={cfg.title} />
  }

  const head = await get_head_row(id, user.id, type)

  if (!head) {
    return <NotFound title={`${cfg.entityName} not found`} backHref={headBasePath(type)} backLabel={`Back to ${cfg.backText}`} />
  }

  const isAccount = type === 'account'

  // Always resolved, even with an explicit ?scope=: the toggle needs to know which view
  // the bare URL means, so its link back to that view can drop the param.
  const fallback_scope = await default_scope(head.id, user.id)
  const requested_scope: HeadScope = scope_param === 'subtree' || scope_param === 'self' ? scope_param : fallback_scope

  // The heads every query below is scoped to. Only the subtree view pays for the extra
  // lookup; the default view knows its one id without touching the DB. A head with no
  // descendants collapses back to the self view — a hand-typed ?scope=subtree on a leaf
  // should render the ordinary page, not an "including sub-heads" one that includes none.
  const scoped_head_ids = requested_scope === 'subtree' ? await load_subtree_head_ids(head.id, user.id) : new Set([head.id])
  const scope: HeadScope = scoped_head_ids.size > 1 ? 'subtree' : 'self'
  const scoped_id_filter = { accounting_head_id: { in: [...scoped_head_ids] } }

  // The line-item pass (one transaction query, prices, totals, FIFO) is shared with the
  // "Show more" action; the future, rollup and linked-user lookups are independent, so
  // they run alongside it.
  const [core, futureTransactions, rollup, linked_user] = await Promise.all([
    load_head_line_items({ user_id: user.id, head_id: head.id, is_account: isAccount, scoped_head_ids, scope }),
    prisma.transaction.findMany({
      where: { user_id: user.id, is_future: true, line_items: { some: scoped_id_filter } },
      select: head_txn_select,
      orderBy: { datetime: 'asc' },
    }),
    compute_head_rollup(head.id, user.id),
    isAccount && head.linked_user_id
      ? prisma.user.findUnique({ where: { id: head.linked_user_id }, select: { id: true, username: true, upi_id: true } })
      : null,
  ])
  const { transactions, uniqueAssets, priceByAsset, acc_total, book_total, own_total, cashflows, map, invested_total, holds_non_rupees, line_items } =
    core

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

  // XIRR only says something on a head that holds (or held) priced assets. On a
  // rupees-only head every flow is at face value, so it is 0% by construction — the asset
  // page skips rupees for the same reason.
  let xirr_value: number | null = null
  if (holds_non_rupees && cashflows.length > 0) {
    if (!acc_total.equals(0)) cashflows.push({ amount: acc_total.toNumber(), when: new Date() })
    xirr_value = calculate_xirr(cashflows)
  }

  const { children } = rollup
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
        // Every figure here is on the active scope — the details card shows one scope's
        // numbers and nothing else, so the reader never has to work out which total the
        // holdings and line items below belong to.
        total: acc_total.toNumber(),
        book_total: book_total.toNumber(),
        // Cost figures only say something on a head that holds priced assets; on a
        // rupees-only one they'd both just restate the balance.
        invested_total: holds_non_rupees ? invested_total.toNumber() : null,
        own_total: own_total.toNumber(),
        children,
        parent,
        linked_user,
        lock_date: head.lock_date ? formatInTimeZone(head.lock_date, USER_TIMEZONE, 'd MMM yyyy') : null,
        xirr: xirr_value,
        upi_id: linked_user?.upi_id ?? null,
        breakdown,
        // One page with the HTML; the rest arrive through get_more_head_line_items.
        line_items: line_items.slice(0, LINE_ITEMS_PAGE),
        line_item_count: line_items.length,
        value_timeseries,
        future_transactions: future_transactions_for_client,
      }}
      config={{ backLink: headBasePath(type), backText: cfg.backText, entityName: cfg.entityName, subEntityLabel: cfg.subEntityLabel }}
      scope={scope}
      defaultScope={fallback_scope}
      closingBalanceAction={type === 'income_expense' ? undefined : get_closing_balance}
      loadMoreLineItems={get_more_head_line_items}
      interestCheck={
        type === 'account'
          ? {
              today: ist_ymd(new Date()),
              getExpectedInterest: get_expected_interest,
              saved: parse_saved_interest_settings(head.interest_settings),
              saveSettings: save_interest_settings,
            }
          : undefined
      }
      // the reconcile picker only lists real, active accounts — don't offer a link that lands unselectable
    />
  )
}

export default profile('/heads/[type]/[id]', Page)
