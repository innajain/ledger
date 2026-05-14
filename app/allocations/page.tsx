import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { account_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Allocations',
  description: 'View and manage your allocation accounts',
}

export default async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Allocations</h1>
        <p>Please log in to view allocations.</p>
      </div>
    )
  }

  const [[allocations, assets], { accountsToAssets: balances }] = await Promise.all([
    prisma.$transaction([
      prisma.account.findMany({
        where: { user_id: user.id, type: account_type.allocation },
        include: { parent: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
      prisma.asset.findMany({ where: { user_id: user.id } }),
    ]),
    get_or_compute_balances(),
  ])
  const totalsByAccount: Map<string, Prisma.Decimal> = new Map()
  const assetMap = new Map(assets.map(a => [a.id, a]))
  const priceByAsset = await get_prices_for_assets(assets)

  for (const alloc of allocations) {
    const asset_qty_map = balances.get(alloc.id) ?? new Map<string, { qty: number; book_value: number }>()

    let total_value = new Prisma.Decimal(0)
    for (const [asset_id, { qty, book_value }] of asset_qty_map.entries()) {
      const price_data = priceByAsset.get(asset_id) ?? null
      if (price_data) {
        total_value = total_value.add(new Prisma.Decimal(price_data.price).mul(qty))
      } else {
        total_value = total_value.add(book_value)
      }
    }

    totalsByAccount.set(alloc.id, total_value)
  }

  const assetQuantitiesByAccount: Map<string, Map<string, number>> = new Map()
  balances.forEach((asset_qty_map, accId) => {
    const assetQuantities: Map<string, number> = new Map()
    asset_qty_map.forEach(({ qty }, assetId) => {
      const asset = assetMap.get(assetId)
      if (asset) {
        assetQuantities.set(asset.name, qty)
      }
    })
    assetQuantitiesByAccount.set(accId, assetQuantities)
  })

  const grand_total = totalsByAccount
    .values()
    .reduce((sum, val) => sum.add(val), new Prisma.Decimal(0))
    .toNumber()

  return (
    <ClientPage
      allocations={allocations}
      totals={new Map(totalsByAccount.entries().map(([accId, total]) => [accId, total.toNumber()]))}
      assetQuantities={assetQuantitiesByAccount}
      grand_total={grand_total}
    />
  )
}
