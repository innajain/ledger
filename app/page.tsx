import { Suspense } from 'react'
import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { Prisma } from '@/generated/prisma/client'
import { get_or_compute_balances } from './_actions/compute_balances'
import { compute_head_value } from '@/app/_utils/head_value'
import { normalize_txn, type TransactionFull } from '@/app/_utils/normalize_txn'
import { pick_welcome_message } from '@/app/_utils/home_welcome'
import { month_to_date_window, summarize_income_expense, window_label, type SummaryLine } from '@/app/_utils/home_month_summary'
import { InvestXirrBadge, InvestXirrBadgeFallback } from '@/app/_components/InvestXirrBadge'
import { HomeNetWorthTrend, HomeNetWorthTrendFallback } from '@/app/_components/HomeNetWorthTrend'
import type { AssetBalance } from '@/app/_utils/home_networth_series'
import type { HomeRecentTransaction } from '@/app/_components/HomeRecentTransactions'
import { profile } from '@/lib/metrics/profile'

const RECENT_TRANSACTION_COUNT = 15
const TOP_SPEND_CATEGORIES = 4

const txn_include = { line_items: { include: { asset: true, accounting_head: true } } }

// Book total of the account lines — the same number the transactions list shows, so the two
// pages can never disagree about what a transaction "cost".
function book_total(txn: { line_items: { accounting_head: { type: string }; txn_value: Prisma.Decimal }[] }): number {
  return txn.line_items
    .filter(li => li.accounting_head.type === 'account')
    .reduce((sum, li) => sum.add(li.txn_value), new Prisma.Decimal(0))
    .toNumber()
}

function summary_lines(txns: TransactionFull[]): SummaryLine[] {
  return txns.flatMap(txn =>
    normalize_txn(txn).line_items.map(li => ({
      head_id: li.accounting_head_id,
      head_name: li.accounting_head.name,
      head_type: li.accounting_head.type,
      txn_value: li.txn_value.toNumber(),
    })),
  )
}

async function Home() {
  const welcome_message = pick_welcome_message()

  const user = await get_current_user()
  if (!user) {
    return <ClientPage welcomeMessage={welcome_message} invest={null} savings={null} networth={null} />
  }

  const now = new Date()
  const this_month = month_to_date_window(now)

  const [allocations, assets, { accountsToAssets: balances }, month_txns, recent_txns] = await Promise.all([
    prisma.accounting_head.findMany({ where: { user_id: user.id, type: 'allocation' } }),
    prisma.asset.findMany(),
    get_or_compute_balances(),
    // income_expense lines are what makes a transaction income or spend at all
    // (transfers/EMIs/investments carry none).
    prisma.transaction.findMany({
      where: {
        user_id: user.id,
        datetime: { gte: this_month.from, lt: this_month.to },
        line_items: { some: { accounting_head: { type: 'income_expense' } } },
      },
      include: txn_include,
    }),
    prisma.transaction.findMany({
      where: { user_id: user.id },
      include: txn_include,
      orderBy: { datetime: 'desc' },
      take: RECENT_TRANSACTION_COUNT,
    }),
  ])

  const priceByAsset = await get_prices_for_assets(assets)

  const invest = allocations.find(a => a.name === 'Investments')
  const savings = allocations.find(a => a.name === 'Savings')

  const childrenByParent = new Map<string, string[]>()
  for (const acc of allocations) {
    if (!acc.parent_id) continue
    const children = childrenByParent.get(acc.parent_id) ?? []
    children.push(acc.id)
    childrenByParent.set(acc.parent_id, children)
  }

  function get_subtree_accounting_head_ids(root: (typeof allocations)[0] | undefined) {
    if (!root) return new Set<string>()
    const ids = new Set<string>([root.id])
    const stack = [root.id]

    while (stack.length > 0) {
      const current = stack.pop()!
      const children = childrenByParent.get(current) ?? []
      for (const child_id of children) {
        if (ids.has(child_id)) continue
        ids.add(child_id)
        stack.push(child_id)
      }
    }

    return ids
  }

  function compute_allocation_value(acc: (typeof allocations)[0] | undefined) {
    if (!acc) return null
    const total_value = compute_head_value(balances.get(acc.id) ?? new Map(), priceByAsset)
    return { id: acc.id, name: acc.name, total: total_value }
  }

  const allocation_values = allocations.map(acc => compute_allocation_value(acc))
  const allocation_value_by_id = new Map(allocation_values.filter((v): v is NonNullable<typeof v> => v !== null).map(v => [v.id, v.total] as const))

  function compute_subtree_total(root: (typeof allocations)[0] | undefined) {
    if (!root) return null
    const subtree_ids = get_subtree_accounting_head_ids(root)
    let total = new Prisma.Decimal(0)
    for (const id of subtree_ids) {
      total = total.add(allocation_value_by_id.get(id) ?? new Prisma.Decimal(0))
    }
    return { id: root.id, name: root.name, total: total.toNumber() }
  }

  const invest_with_value = compute_subtree_total(invest)
  const savings_with_value = compute_subtree_total(savings)

  const networth = allocation_values.reduce((sum, v) => sum.add(v?.total ?? new Prisma.Decimal(0)), new Prisma.Decimal(0)).toNumber()

  const investSubtreeIds = invest ? Array.from(get_subtree_accounting_head_ids(invest)) : []
  const investXirrSlot =
    invest && invest_with_value && invest_with_value.total !== 0 ? (
      <Suspense fallback={<InvestXirrBadgeFallback />}>
        <InvestXirrBadge userId={user.id} subtreeAccountIds={investSubtreeIds} currentValue={invest_with_value.total} />
      </Suspense>
    ) : null

  // Net worth is the total across allocation heads, so its per-asset balance is too.
  const current_by_asset = new Map<string, AssetBalance>()
  for (const acc of allocations) {
    for (const [asset_id, balance] of balances.get(acc.id) ?? new Map<string, AssetBalance>()) {
      const running = current_by_asset.get(asset_id) ?? { qty: 0, txn_value: 0 }
      current_by_asset.set(asset_id, { qty: running.qty + balance.qty, txn_value: running.txn_value + balance.txn_value })
    }
  }

  // Replaying the ledger is far too slow for first paint, so it streams in behind Suspense.
  const networthTrendSlot =
    current_by_asset.size > 0 ? (
      <Suspense fallback={<HomeNetWorthTrendFallback />}>
        <HomeNetWorthTrend
          userId={user.id}
          current={current_by_asset}
          assets={assets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker }))}
          networth={networth}
        />
      </Suspense>
    ) : null

  const this_month_summary = summarize_income_expense(summary_lines(month_txns), TOP_SPEND_CATEGORIES)

  const month = {
    spend: this_month_summary.spend,
    income: this_month_summary.income,
    categories: this_month_summary.categories,
    label: window_label(this_month),
  }

  const recent: HomeRecentTransaction[] = recent_txns.map(txn => ({
    id: txn.id,
    date: txn.datetime,
    description: txn.description,
    total_book: book_total(normalize_txn(txn)),
  }))

  return (
    <ClientPage
      welcomeMessage={welcome_message}
      loggedIn
      invest={invest_with_value}
      investXirrSlot={investXirrSlot}
      savings={savings_with_value}
      networth={networth}
      networthTrendSlot={networthTrendSlot}
      month={month}
      recent={recent}
    />
  )
}

export default profile('/', Home)
