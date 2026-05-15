import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { account_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Income & Expenses',
  description: 'View and manage your income and expense accounts',
}

export default async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Income / Expense</h1>
        <p>Please log in to view nominal accounts.</p>
      </div>
    )
  }
  const [[accounts, assets], { accountsToAssets: balances }] = await Promise.all([
    prisma.$transaction([
      prisma.account.findMany({
        where: { user_id: user.id, type: account_type.nominal },
        include: { parent: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
      prisma.asset.findMany({ where: { user_id: user.id } }),
    ]),
    get_or_compute_balances(),
  ])

  const totalsByAccount: Map<string, Prisma.Decimal> = new Map()
  const assetMap = new Map(assets.map(a => [a.id, a]))

  await Promise.all(
    accounts.map(async acc => {
      const asset_qty_map = balances.get(acc.id) ?? new Map<string, { qty: number; book_value: number }>()

      let total_value = new Prisma.Decimal(0)
      for (const [asset_id, { qty, book_value }] of asset_qty_map.entries()) {
        const asset = assetMap.get(asset_id)!
        const price_data = await get_price_for_asset(asset.type, asset.ticker)
        if (price_data) {
          total_value = total_value.add(new Prisma.Decimal(price_data.price).mul(qty))
        } else {
          total_value = total_value.add(book_value)
        }
      }

      totalsByAccount.set(acc.id, total_value)
    }),
  )

  const assetQuantitiesByAccount: Record<string, Record<string, number>> = {}
  balances.forEach((asset_qty_map, accId) => {
    const assetQuantities: Record<string, number> = {}
    asset_qty_map.forEach(({ qty }, assetId) => {
      const asset = assetMap.get(assetId)
      if (asset) {
        assetQuantities[asset.name] = qty
      }
    })
    assetQuantitiesByAccount[accId] = assetQuantities
  })

  return <ClientPage accounts={accounts} totals={new Map(totalsByAccount.entries().map(([accId, total]) => [accId, total.toNumber()]))} />
}
