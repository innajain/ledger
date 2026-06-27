/**
 * Framework-agnostic valuation: net worth (allocation-head values at live
 * prices), allocation subtree totals, and XIRR over a set of accounting heads.
 * Shared by the dashboard (`app/page.tsx`, `InvestXirrBadge`) and the CLI so the
 * numbers can't diverge. Takes an explicit `user_id`.
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { compute_balances_core } from '@/app/_core/balances_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_head_value } from '@/app/_utils/head_value'
import { get_subtree_head_ids } from '@/app/_utils/subtree_value'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'

export type AllocationValue = { id: string; name: string; parent_id: string | null; total: number }
export type NetWorth = { networth: number; allocations: AllocationValue[] }

export async function compute_net_worth(user_id: string): Promise<NetWorth> {
  const [allocations, assets, { accountsToAssets }] = await Promise.all([
    prisma.accounting_head.findMany({ where: { user_id, type: 'allocation' }, select: { id: true, name: true, parent_id: true } }),
    prisma.asset.findMany({ select: { id: true, type: true, ticker: true } }),
    compute_balances_core(user_id),
  ])
  const priceByAsset = await get_prices_for_assets(assets)
  const allocs: AllocationValue[] = allocations.map(a => ({
    id: a.id,
    name: a.name,
    parent_id: a.parent_id,
    total: compute_head_value(accountsToAssets.get(a.id) ?? new Map(), priceByAsset).toNumber(),
  }))
  const networth = allocs.reduce((s, a) => s + a.total, 0)
  return { networth, allocations: allocs }
}

/** Total value (and member head ids) of an allocation subtree by root name, e.g. "Investments". */
export function subtree_total(allocations: AllocationValue[], root_name: string): { ids: string[]; total: number } | null {
  const root = allocations.find(a => a.name === root_name)
  if (!root) return null
  const ids = get_subtree_head_ids(root.id, allocations)
  let total = 0
  for (const a of allocations) if (ids.has(a.id)) total += a.total
  return { ids: Array.from(ids), total }
}

/**
 * XIRR over every transaction touching the given accounting heads: each linked
 * line is an outflow (−txn_value) at its datetime, plus the current value as a
 * final inflow today. Returns null when there's nothing to annualize. Identical
 * to the dashboard's Investments badge.
 */
export async function compute_xirr_for_accounts(user_id: string, account_ids: string[], current_value: number): Promise<number | null> {
  if (account_ids.length === 0 || current_value === 0) return null

  const rawTransactions = await prisma.transaction.findMany({
    where: {
      user_id,
      line_items: { some: { accounting_head_id: { in: account_ids } } },
    },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
  if (rawTransactions.length === 0) return null

  const subtreeIdSet = new Set(account_ids)
  const cashflows: { amount: number; when: Date }[] = []
  for (const tx of rawTransactions.map(normalize_txn)) {
    for (const li of tx.line_items) {
      if (!subtreeIdSet.has(li.accounting_head_id)) continue
      cashflows.push({
        amount: -(li.txn_value as Prisma.Decimal).toNumber(),
        when: li.datetime ?? tx.datetime,
      })
    }
  }
  cashflows.push({ amount: current_value, when: new Date() })
  const xirr = calculate_xirr(cashflows)
  return xirr ?? null
}
