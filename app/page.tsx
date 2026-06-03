import { Suspense } from 'react'
import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { Prisma } from '@/generated/prisma/client'
import { get_or_compute_balances } from './_actions/compute_balances'
import { compute_head_value } from '@/app/_utils/head_value'
import { InvestXirrBadge, InvestXirrBadgeFallback } from '@/app/_components/InvestXirrBadge'
import { profile } from '@/lib/metrics/profile'

async function Home() {
  const user = await get_current_user()
  if (!user) {
    return <ClientPage invest={null} savings={null} networth={null} />
  }

  const [allocations, assets, { accountsToAssets: balances }] = await Promise.all([
    prisma.accounting_head.findMany({ where: { user_id: user.id, type: 'allocation' } }),
    prisma.asset.findMany(),
    get_or_compute_balances(),
  ])

  const priceByAsset = await get_prices_for_assets(assets)

  const invest = allocations.find(a => a.name === 'Investments')
  const savings = allocations.find(a => a.name === 'Savings')

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
  const savings_with_value = compute_subtree_total(savings)

  const networth = allocation_values.reduce((sum, v) => sum.add(v?.total ?? new Prisma.Decimal(0)), new Prisma.Decimal(0)).toNumber()

  // Investments XIRR is streamed in via Suspense so the rest of the dashboard
  // paints immediately — the XIRR query touches every transaction in the
  // Investments subtree, which can be slow for heavy users.
  const investSubtreeIds = invest ? Array.from(get_subtree_accounting_head_ids(invest)) : []
  const investXirrSlot =
    invest && invest_with_value && invest_with_value.total !== 0 ? (
      <Suspense fallback={<InvestXirrBadgeFallback />}>
        <InvestXirrBadge userId={user.id} subtreeAccountIds={investSubtreeIds} currentValue={invest_with_value.total} />
      </Suspense>
    ) : null

  return <ClientPage invest={invest_with_value} investXirrSlot={investXirrSlot} savings={savings_with_value} networth={networth} />
}

export default profile('/', Home)
