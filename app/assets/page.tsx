import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { account_type, asset_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_line_item_qty } from '../_utils/validate_line_items'
import { get_or_compute_balances } from '../_actions/compute_balances'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Assets',
  description: 'View and manage all your financial assets',
}

export default async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Assets</h1>
        <p>Please log in to view assets.</p>
      </div>
    )
  }

  const [assets, balances] = await Promise.all([
    prisma.asset.findMany({
      where: { user_id: user.id },
      include: { parent: true },
    }),
    get_or_compute_balances(),
  ])

  const currValuesByAsset: Map<string, number> = new Map()

  await Promise.all(
    assets.map(async ass => {
      const price_data = await get_price_for_asset(ass.type, ass.ticker)
      const acc_qty_map = balances.get(ass.id) ?? new Map<string, { qty: number; book_value: number }>()

      let total_value = new Prisma.Decimal(0)
      for (const [acc_id, { qty, book_value }] of acc_qty_map.entries()) {
        if (price_data) {
          total_value = total_value.add(new Prisma.Decimal(price_data.price).mul(qty))
        } else {
          total_value = total_value.add(book_value)
        }
      }

      currValuesByAsset.set(ass.id, total_value.toNumber())
    }),
  )

  const assetAccountQuantities: Map<string, Map<string, number>> = new Map()
  balances.forEach((acc_qty_map, asset_id) => {
    const accQuantities: Map<string, number> = new Map()
    acc_qty_map.forEach(({ qty }, acc_id) => {
      accQuantities.set(acc_id, qty)
    })
    assetAccountQuantities.set(asset_id, accQuantities)
  })

  const grand_total = Array.from(currValuesByAsset.values()).reduce((sum, val) => sum.add(val), new Prisma.Decimal(0))

  return (
    <ClientPage assets={assets} assetAccountQuantities={assetAccountQuantities} totals={currValuesByAsset} grand_total={grand_total.toNumber()} />
  )
}
