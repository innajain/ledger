import 'server-only'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import type { asset_type } from '@/generated/prisma/enums'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { get_price_lookups_for_assets } from '@/app/_utils/historical_price_fetcher'
import { ist_day_window, collect_networth_events, build_networth_sparkline, type AssetBalance, type PriceAt } from '@/app/_utils/home_networth_series'
import { HomeNetWorthSparkline, HomeNetWorthSparklineFallback } from './HomeNetWorthSparkline'

export const HOME_TREND_DAYS = 90

type Props = {
  userId: string
  /** Today's per-asset balance across all allocation heads — the basis of net worth. */
  current: ReadonlyMap<string, AssetBalance>
  assets: { id: string; type: asset_type; ticker: string | null }[]
  /** The net worth the page already computed; the series is pinned to it so the two agree. */
  networth: number
  days?: number
}

export async function HomeNetWorthTrend({ userId, current, assets, networth, days = HOME_TREND_DAYS }: Props) {
  const window = ist_day_window(new Date(), days)
  const since = window[0].start

  // Split the old OR-with-relation-subquery into two index-friendly queries: the OR
  // form forced Postgres to walk the user's whole transaction history instead of using
  // the (user_id, datetime) range index. The lt/gte split keeps them disjoint.
  // Select only what the dedup, normalize_line_items and collect_networth_events read.
  const txn_select = {
    id: true,
    datetime: true,
    line_items: {
      select: {
        asset_id: true,
        datetime: true,
        quantity: true,
        txn_value: true,
        accounting_head: { select: { type: true } },
        asset: { select: { id: true, type: true, name: true } },
      },
    },
  } satisfies Prisma.transactionSelect
  const [in_window, overridden_into_window] = await Promise.all([
    prisma.transaction.findMany({
      where: { user_id: userId, ...NOT_FUTURE, datetime: { gte: since } },
      select: txn_select,
    }),
    prisma.transaction.findMany({
      where: { user_id: userId, ...NOT_FUTURE, datetime: { lt: since }, line_items: { some: { datetime: { gte: since } } } },
      select: txn_select,
    }),
  ])
  const seen = new Set<string>()
  const raw = [...in_window, ...overridden_into_window].filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)))

  const events = collect_networth_events(raw.map(t => ({ datetime: t.datetime, line_items: normalize_line_items(t.line_items) })))

  const relevant = new Set<string>([...current.keys(), ...events.map(e => e.asset_id)])
  const lookups = await get_price_lookups_for_assets(
    assets.filter(a => relevant.has(a.id)),
    since,
  )
  const price_at: PriceAt = (asset_id, at) => lookups.get(asset_id)?.(at) ?? null

  const points = build_networth_sparkline(window, current, events, price_at)
  if (points.length > 0) points[points.length - 1] = { ...points[points.length - 1], value: networth }

  return <HomeNetWorthSparkline points={points} days={days} />
}

export function HomeNetWorthTrendFallback({ days = HOME_TREND_DAYS }: { days?: number }) {
  return <HomeNetWorthSparklineFallback days={days} />
}
