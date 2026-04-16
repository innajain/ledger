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

  const invest = allocations.find(a => a.name === 'Investments')
  const savings = allocations.find(a => a.name === 'Savings')

  const childrenByParent = new Map<string, string[]>()
  for (const acc of allocations) {
    if (!acc.parent_id) continue
    const children = childrenByParent.get(acc.parent_id) ?? []
    children.push(acc.id)
    childrenByParent.set(acc.parent_id, children)
  }

  function get_subtree_account_ids(root: (typeof allocations)[0] | undefined) {
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

  const assets = await prisma.asset.findMany({ where: { user_id: user.id } })
  const assetMap = new Map(assets.map(a => [a.id, a]))

  const { accountsToAssets: balances } = await get_or_compute_balances(true)

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

    return { id: acc.id, name: acc.name, total: total_value }
  }

  const allocation_values = await Promise.all(allocations.map(acc => compute_allocation_value(acc)))
  const allocation_value_by_id = new Map(allocation_values.filter((v): v is NonNullable<typeof v> => v !== null).map(v => [v.id, v.total] as const))

  function compute_subtree_total(root: (typeof allocations)[0] | undefined) {
    if (!root) return null
    const subtree_ids = get_subtree_account_ids(root)
    let total = new Prisma.Decimal(0)
    for (const id of subtree_ids) {
      total = total.add(allocation_value_by_id.get(id) ?? new Prisma.Decimal(0))
    }
    return { id: root.id, name: root.name, total: total.toNumber() }
  }

  const invest_with_value = compute_subtree_total(invest)
  const savings_with_value = compute_subtree_total(savings)

  const networth = allocation_values.reduce((sum, v) => sum.add(v?.total ?? new Prisma.Decimal(0)), new Prisma.Decimal(0)).toNumber()

  return <ClientPage invest={invest_with_value} savings={savings_with_value} networth={networth} />
}
