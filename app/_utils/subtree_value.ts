import 'server-only'
import { asset_type, Prisma } from '@/generated/prisma/client'
import { accounting_head_type } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { get_or_compute_balances } from '@/app/_actions/compute_balances'
import { get_prices_for_assets } from './price_fetcher'
import { compute_current_value } from './compute_current_value'

export function get_subtree_head_ids(root_id: string, heads: { id: string; parent_id: string | null }[]): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const h of heads) {
    if (!h.parent_id) continue
    const arr = childrenByParent.get(h.parent_id) ?? []
    arr.push(h.id)
    childrenByParent.set(h.parent_id, arr)
  }

  const ids = new Set<string>([root_id])
  const stack = [root_id]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child_id of childrenByParent.get(current) ?? []) {
      if (ids.has(child_id)) continue
      ids.add(child_id)
      stack.push(child_id)
    }
  }
  return ids
}

// The heads an "including sub-heads" view covers: the root plus every descendant. Slim
// on purpose — the page needs these ids before it can query transactions, so this runs
// ahead of the rollup rather than alongside it.
export async function load_subtree_head_ids(root_id: string, user_id: string): Promise<Set<string>> {
  const heads = await prisma.accounting_head.findMany({ where: { user_id }, select: { id: true, parent_id: true } })
  return get_subtree_head_ids(root_id, heads)
}

export function compute_subtree_total(
  subtree_ids: Set<string>,
  balances: Map<string, Map<string, { qty: number; txn_value: number }>>,
  assetTypeById: Map<string, asset_type>,
  priceByAsset: Map<string, { price: number; date: Date } | null>,
): Prisma.Decimal {
  let total = new Prisma.Decimal(0)
  for (const head_id of subtree_ids) {
    const assetMap = balances.get(head_id)
    if (!assetMap) continue
    for (const [asset_id, { qty, txn_value }] of assetMap.entries()) {
      const type = assetTypeById.get(asset_id) ?? asset_type.rupees
      const priceData = priceByAsset.get(asset_id) ?? null
      const price = priceData ? new Prisma.Decimal(priceData.price) : null
      total = total.add(compute_current_value(type, new Prisma.Decimal(qty), price, new Prisma.Decimal(txn_value)))
    }
  }
  return total
}

const HEAD_ROUTE: Record<accounting_head_type, string> = {
  account: '/heads/account',
  income_expense: '/heads/income_expense',
  allocation: '/heads/allocation',
}

export function head_detail_link(type: accounting_head_type, id: string): string {
  return `${HEAD_ROUTE[type]}/${id}`
}

export type ChildHeadSummary = { id: string; name: string; link: string; total: number }

// The head's immediate children, each carrying the total of its own whole subtree. The
// root's subtree total is deliberately not returned: the head page reports on one scope
// at a time (see the ScopeToggle), and it computes the subtree figures live from line
// items when the reader asks for them, which is what gives that view a FIFO cost basis
// these cached balances cannot supply.
export async function compute_head_rollup(root_id: string, user_id: string): Promise<{ children: ChildHeadSummary[] }> {
  const [all_heads, { accountsToAssets: balances }] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id },
      select: { id: true, parent_id: true, name: true, type: true },
    }),
    get_or_compute_balances(),
  ])
  const subtree_ids = get_subtree_head_ids(root_id, all_heads)
  if (subtree_ids.size <= 1) return { children: [] }

  const subtree_asset_ids = new Set<string>()
  for (const head_id of subtree_ids) for (const asset_id of balances.get(head_id)?.keys() ?? []) subtree_asset_ids.add(asset_id)
  const subtree_assets = await prisma.asset.findMany({
    where: { id: { in: Array.from(subtree_asset_ids) } },
    select: { id: true, type: true, ticker: true },
  })
  const price_by_asset = await get_prices_for_assets(subtree_assets)
  const asset_type_by_id = new Map(subtree_assets.map(a => [a.id, a.type]))

  const children: ChildHeadSummary[] = all_heads
    .filter(h => h.parent_id === root_id)
    .map(child => ({
      id: child.id,
      name: child.name,
      link: head_detail_link(child.type, child.id),
      total: compute_subtree_total(get_subtree_head_ids(child.id, all_heads), balances, asset_type_by_id, price_by_asset).toNumber(),
    }))
  children.sort((a, b) => b.total - a.total)

  return { children }
}
