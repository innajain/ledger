import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { accounting_head_type } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'
import { compute_head_value } from '../_utils/head_value'
import { profile } from '@/lib/metrics/profile'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Accounts',
  description: 'View and manage your financial accounts',
}

async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Accounts</h1>
        <p>Please log in to view accounts.</p>
      </div>
    )
  }

  const [[accounts, assets], { accountsToAssets: balances }] = await Promise.all([
    prisma.$transaction([
      prisma.accounting_head.findMany({
        where: { user_id: user.id, type: accounting_head_type.account },
        include: { parent: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
      prisma.asset.findMany(),
    ]),
    get_or_compute_balances(),
  ])

  const assetMap = new Map(assets.map(a => [a.id, a]))
  const priceByAsset = await get_prices_for_assets(assets)

  const totals = new Map(accounts.map(acc => [acc.id, compute_head_value(balances.get(acc.id) ?? new Map(), priceByAsset).toNumber()]))

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

  return <ClientPage accounts={accounts} totals={totals} accountAssetQuantities={assetQuantitiesByAccount} />
}

export default profile('/accounts', Page)
