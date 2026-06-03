import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import HeadListClient from './HeadListClient'
import { HEAD_CONFIG, isHeadType } from './head_config'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { get_or_compute_balances } from '@/app/_actions/compute_balances'
import { compute_head_value } from '@/app/_utils/head_value'
import { profile } from '@/lib/metrics/profile'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = { params: Promise<{ type: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params
  if (!isHeadType(type)) return {}
  return { title: HEAD_CONFIG[type].title, description: HEAD_CONFIG[type].listDescription }
}

async function Page({ params }: Props) {
  const { type } = await params
  if (!isHeadType(type)) notFound()
  const cfg = HEAD_CONFIG[type]

  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>{cfg.title}</h1>
        <p>Please log in to view {cfg.title.toLowerCase()}.</p>
      </div>
    )
  }

  const [[heads, assets], { accountsToAssets: balances }] = await Promise.all([
    prisma.$transaction([
      prisma.accounting_head.findMany({
        where: { user_id: user.id, type },
        include: { parent: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
      prisma.asset.findMany(),
    ]),
    get_or_compute_balances(),
  ])

  const assetMap = new Map(assets.map(a => [a.id, a]))
  const priceByAsset = await get_prices_for_assets(assets)

  const totals = new Map(heads.map(h => [h.id, compute_head_value(balances.get(h.id) ?? new Map(), priceByAsset).toNumber()]))

  // assetId → (asset name → signed qty), used to flag negative holdings on the list.
  const assetQuantities: Map<string, Map<string, number>> = new Map()
  balances.forEach((asset_qty_map, headId) => {
    const byName: Map<string, number> = new Map()
    asset_qty_map.forEach(({ qty }, assetId) => {
      const asset = assetMap.get(assetId)
      if (asset) byName.set(asset.name, qty)
    })
    assetQuantities.set(headId, byName)
  })

  return <HeadListClient type={type} heads={heads} totals={totals} assetQuantities={assetQuantities} />
}

export default profile('/heads/[type]', Page)
