import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import HeadListClient, { type PeriodValue } from './HeadListClient'
import { HEAD_CONFIG, isHeadType } from './head_config'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { get_or_compute_balances } from '@/app/_actions/compute_balances'
import { period_balances_core } from '@/app/_core/balances_core'
import { current_financial_year, financial_year_window, fy_label } from '@/app/_utils/financial_year'
import { compute_head_value } from '@/app/_utils/head_value'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = { params: Promise<{ type: string }>; searchParams: Promise<{ period?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params
  if (!isHeadType(type)) return {}
  return { title: HEAD_CONFIG[type].title, description: HEAD_CONFIG[type].listDescription }
}

async function Page({ params, searchParams }: Props) {
  const { type } = await params
  if (!isHeadType(type)) notFound()
  const cfg = HEAD_CONFIG[type]

  // Lifetime is the default, so it is the param's absence; `fy` is only offered where a
  // running-since-forever total is the wrong question (see showPeriodToggle).
  const fy_start_year = current_financial_year(new Date())
  const period: PeriodValue = cfg.showPeriodToggle && (await searchParams).period === 'fy' ? 'fy' : 'all'

  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title={cfg.title} />
  }

  const [heads, assets, balances] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, type },
      include: { parent: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany(),
    // The all-time map is the cached one every page shares; a period cut is computed on
    // demand for this list alone, so the cached map is not even fetched in that mode.
    period === 'fy'
      ? (({ from, to }) => period_balances_core(user.id, type, from, to))(financial_year_window(fy_start_year))
      : get_or_compute_balances().then(b => b.accountsToAssets),
  ])

  const assetMap = new Map(assets.map(a => [a.id, a]))
  // The asset table is a shared catalog — only price what this user actually holds.
  const held = new Set<string>()
  for (const asset_map of balances.values()) for (const asset_id of asset_map.keys()) held.add(asset_id)
  const priceByAsset = await get_prices_for_assets(assets.filter(a => held.has(a.id)))

  const totals = new Map(heads.map(h => [h.id, compute_head_value(balances.get(h.id) ?? new Map(), priceByAsset).toNumber()]))

  const assetQuantities: Map<string, Map<string, number>> = new Map()
  balances.forEach((asset_qty_map, headId) => {
    const byName: Map<string, number> = new Map()
    asset_qty_map.forEach(({ qty }, assetId) => {
      const asset = assetMap.get(assetId)
      if (asset) byName.set(asset.name, qty)
    })
    assetQuantities.set(headId, byName)
  })

  return (
    <HeadListClient type={type} heads={heads} totals={totals} assetQuantities={assetQuantities} period={period} fyLabel={fy_label(fy_start_year)} />
  )
}

export default profile('/heads/[type]', Page)
