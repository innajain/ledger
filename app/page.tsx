import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { Prisma } from '@/generated/prisma/client'
import { get_or_compute_balances } from './_actions/compute_balances'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'

export default async function Home() {
  const user = await get_current_user()
  if (!user) {
    return <ClientPage invest={null} savings={null} networth={null} />
  }

  const [allocations, assets, { accountsToAssets: balances }] = await Promise.all([
    prisma.account.findMany({ where: { user_id: user.id, type: 'allocation' } }),
    prisma.asset.findMany({ where: { user_id: user.id } }),
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

  function compute_allocation_value(acc: (typeof allocations)[0] | undefined) {
    if (!acc) return null
    const asset_qty_map = balances.get(acc.id) ?? new Map<string, { qty: number; book_value: number }>()

    let total_value = new Prisma.Decimal(0)
    for (const [asset_id, { qty, book_value }] of asset_qty_map.entries()) {
      const price_data = priceByAsset.get(asset_id) ?? null
      if (price_data) {
        total_value = total_value.add(new Prisma.Decimal(price_data.price).mul(qty))
      } else {
        total_value = total_value.add(book_value)
      }
    }

    return { id: acc.id, name: acc.name, total: total_value }
  }

  const allocation_values = allocations.map(acc => compute_allocation_value(acc))
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

  // Investments XIRR: same shape as the per-allocation pages, but spanning the
  // entire Investments subtree (so contributions to sub-allocations count).
  let invest_xirr: number | null = null
  if (invest && invest_with_value && invest_with_value.total !== 0) {
    const invest_subtree_ids = get_subtree_account_ids(invest)
    const invest_line_items = await prisma.line_item.findMany({
      where: { account_id: { in: Array.from(invest_subtree_ids) } },
      include: { transaction: true },
    })
    const tx_ids = Array.from(new Set(invest_line_items.map(li => li.transaction_id)))
    if (tx_ids.length > 0) {
      const rawTransactions = await prisma.transaction.findMany({
        where: { id: { in: tx_ids } },
        include: { line_items: { include: { account: true, asset: true } } },
      })
      const normalizedById = new Map<string, { quantity: Prisma.Decimal; book_value: Prisma.Decimal }>()
      for (const tx of rawTransactions.map(normalize_txn)) {
        for (const li of tx.line_items) normalizedById.set(li.id, { quantity: li.quantity, book_value: li.book_value })
      }

      const cashflows: { amount: number; when: Date }[] = []
      for (const li of invest_line_items) {
        const n = normalizedById.get(li.id)!
        cashflows.push({
          amount: -n.book_value.toNumber(),
          when: li.datetime ?? li.transaction.datetime,
        })
      }
      cashflows.push({ amount: invest_with_value.total, when: new Date() })
      invest_xirr = calculate_xirr(cashflows)
    }
  }

  return <ClientPage invest={invest_with_value} investXirr={invest_xirr} savings={savings_with_value} networth={networth} />
}
