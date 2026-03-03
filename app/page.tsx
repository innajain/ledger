import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { Prisma } from '@/generated/prisma/client'
import { get_or_compute_balances } from './_actions/compute_balances'

export default async function Home() {
  const user = await get_current_user()
  if (!user) {
    return <ClientPage invest={null} savings={null} networth={null} />
  }

  const allocations = await prisma.account.findMany({
    where: { user_id: user.id, type: 'allocation' },
  })

  const invest = allocations.find(a => /invest/i.test(a.name))
  const savings = allocations.find(a => /saving/i.test(a.name))

  const assets = await prisma.asset.findMany({ where: { user_id: user.id } })
  const assetMap = new Map(assets.map(a => [a.id, a]))

  const balances = await get_or_compute_balances()

  async function compute_allocation_value(acc: (typeof allocations)[0] | undefined) {
    if (!acc) return null
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

    return { id: acc.id, name: acc.name, total: total_value.toNumber() }
  }

  const allocation_values = await Promise.all(allocations.map(acc => compute_allocation_value(acc)))
  const [invest_with_value, savings_with_value] = [invest, savings].map(a => allocation_values.find(v => v?.id === a?.id) ?? null)

  const networth = allocation_values.reduce((sum, v) => sum + (v?.total ?? 0), 0)

  return <ClientPage invest={invest_with_value} savings={savings_with_value} networth={networth} />
}
