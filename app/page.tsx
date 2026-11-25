import { Suspense } from 'react'
import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { Prisma } from '@/generated/prisma/client'
import { get_or_compute_balances } from './_actions/compute_balances'
import { compute_head_value } from '@/app/_utils/head_value'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { get_inbox } from '@/app/_utils/links'
import { is_future_txn_due, NOT_FUTURE } from '@/app/_utils/future_txn'
import { USER_TIMEZONE } from '@/lib/config'
import { InvestXirrBadge, InvestXirrBadgeFallback } from '@/app/_components/InvestXirrBadge'
import { HomeNetWorthTrend, HomeNetWorthTrendFallback } from '@/app/_components/HomeNetWorthTrend'
import type { AssetBalance } from '@/app/_utils/home_networth_series'
import type { HomeUpcomingTransaction } from '@/app/_components/HomeUpcomingTransactions'
import type { HomeRequest } from '@/app/_components/HomeRequests'
import type { HomeRecentTransaction } from '@/app/_components/HomeRecentTransactions'
import { profile } from '@/lib/metrics/profile'

const UPCOMING_TRANSACTION_COUNT = 15
const RECENT_TRANSACTION_COUNT = 10

// "Wednesday, 25 November 2026" in IST — assembled from parts because en-IN puts a comma
// before the year, and the server's own locale data shouldn't decide the punctuation.
const date_parts_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: USER_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
function today_label(now: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => date_parts_fmt.formatToParts(now).find(p => p.type === type)?.value ?? ''
  return `${part('weekday')}, ${part('day')} ${part('month')} ${part('year')}`
}

// Only the fields the summary/recent rollups and normalize_line_items read — the full
// accounting_head/asset relation rows multiply the payload of the first-paint page.
const txn_select = {
  id: true,
  datetime: true,
  description: true,
  line_items: {
    select: {
      accounting_head_id: true,
      quantity: true,
      txn_value: true,
      accounting_head: { select: { type: true, name: true } },
      asset: { select: { id: true, type: true, name: true } },
    },
  },
} satisfies Prisma.transactionSelect

// Book total of the account lines — the same number the transactions list shows, so the two
// pages can never disagree about what a transaction "cost".
function book_total(line_items: { accounting_head: { type: string }; txn_value: Prisma.Decimal }[]): number {
  return line_items
    .filter(li => li.accounting_head.type === 'account')
    .reduce((sum, li) => sum.add(li.txn_value), new Prisma.Decimal(0))
    .toNumber()
}

async function Home() {
  // One `now` for the whole render, so the date line, the due flags and the recent list
  // can't disagree about what "today" is. Decided on the server: the client re-rendering
  // against its own clock/timezone would hydrate differently.
  const now = new Date()
  const date_label = today_label(now)

  const user = await get_current_user()
  if (!user) {
    return <ClientPage dateLabel={date_label} networth={null} />
  }

  // The asset table is a shared catalog — only price what this user actually holds.
  const assetsPromise = prisma.asset.findMany()
  const balancesPromise = get_or_compute_balances()
  const pricesPromise = Promise.all([assetsPromise, balancesPromise]).then(([all_assets, { accountsToAssets }]) => {
    const held = new Set<string>()
    for (const asset_map of accountsToAssets.values()) for (const asset_id of asset_map.keys()) held.add(asset_id)
    return get_prices_for_assets(all_assets.filter(a => held.has(a.id)))
  })

  const [allocations, assets, { accountsToAssets: balances }, upcoming_txns, recent_txns, priceByAsset, inbox] = await Promise.all([
    prisma.accounting_head.findMany({ where: { user_id: user.id, type: 'allocation' } }),
    assetsPromise,
    balancesPromise,
    prisma.transaction.findMany({
      where: { user_id: user.id, is_future: true },
      select: txn_select,
      orderBy: { datetime: 'asc' },
      take: UPCOMING_TRANSACTION_COUNT,
    }),
    prisma.transaction.findMany({
      where: { user_id: user.id, ...NOT_FUTURE },
      select: { ...txn_select, tag_members: { select: { tag: { select: { name: true } } } } },
      orderBy: { datetime: 'desc' },
      take: RECENT_TRANSACTION_COUNT,
    }),
    pricesPromise,
    get_inbox(user.id),
  ])

  const invest = allocations.find(a => a.name === 'Investments')

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

  // The allocations table: each top-level bucket with everything under it, in the order
  // the user arranged them. A bucket that nets to zero is left out — it would be a line
  // of ₹0.00 between the ones that hold money.
  const top_allocations = allocations
    .filter(a => !a.parent_id)
    .sort((a, b) => (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name))
    .map(a => compute_subtree_total(a)!)
    .filter(a => a.total !== 0)

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

  const recent: HomeRecentTransaction[] = recent_txns.map(txn => ({
    id: txn.id,
    date: txn.datetime,
    description: txn.description,
    total_book: book_total(normalize_line_items(txn.line_items)),
    tags: txn.tag_members.map(m => m.tag.name),
  }))

  const upcoming: HomeUpcomingTransaction[] = upcoming_txns.map(txn => ({
    id: txn.id,
    date: txn.datetime,
    description: txn.description,
    total_book: book_total(normalize_line_items(txn.line_items)),
    is_due: is_future_txn_due(txn.datetime, now),
  }))

  // get_inbox already sign-flips the preview into this user's frame, so the
  // amount here reads the same direction as it will on /requests.
  const requests: HomeRequest[] = inbox.map(item => ({
    link_id: item.link_id,
    status: item.status,
    kind: item.kind,
    other_username: item.other_username,
    description: item.description,
    datetime: item.datetime,
    amount: item.preview.reduce((s, p) => s + (p.txn_value ?? p.quantity ?? 0), 0),
  }))

  return (
    <ClientPage
      dateLabel={date_label}
      loggedIn
      networth={networth}
      networthTrendSlot={networthTrendSlot}
      allocations={top_allocations}
      allocationExtra={invest && investXirrSlot ? { [invest.id]: investXirrSlot } : undefined}
      recent={recent}
      upcoming={upcoming}
      requests={requests}
    />
  )
}

export default profile('/', Home)
