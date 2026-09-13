import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { compute_balances_core } from '@/app/_core/balances_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_head_value } from '@/app/_utils/head_value'
import { get_subtree_head_ids } from '@/app/_utils/subtree_value'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { cashflows_version_key } from '@/app/_utils/value_timeseries'

export type AllocationValue = { id: string; name: string; parent_id: string | null; total: number }
export type NetWorth = { networth: number; allocations: AllocationValue[] }

export async function compute_net_worth(user_id: string): Promise<NetWorth> {
  const [allocations, assets, { accountsToAssets }] = await Promise.all([
    prisma.accounting_head.findMany({ where: { user_id, type: 'allocation' }, select: { id: true, name: true, parent_id: true } }),
    prisma.asset.findMany({ select: { id: true, type: true, ticker: true } }),
    compute_balances_core(user_id),
  ])
  // The asset table is a shared catalog — only price what this user actually holds.
  const held = new Set<string>()
  for (const asset_map of accountsToAssets.values()) for (const asset_id of asset_map.keys()) held.add(asset_id)
  const priceByAsset = await get_prices_for_assets(assets.filter(a => held.has(a.id)))
  const allocs: AllocationValue[] = allocations.map(a => ({
    id: a.id,
    name: a.name,
    parent_id: a.parent_id,
    total: compute_head_value(accountsToAssets.get(a.id) ?? new Map(), priceByAsset).toNumber(),
  }))
  const networth = allocs.reduce((s, a) => s + a.total, 0)
  return { networth, allocations: allocs }
}

export function subtree_total(allocations: AllocationValue[], root_name: string): { ids: string[]; total: number } | null {
  const root = allocations.find(a => a.name === root_name)
  if (!root) return null
  const ids = get_subtree_head_ids(root.id, allocations)
  let total = 0
  for (const a of allocations) if (ids.has(a.id)) total += a.total
  return { ids: Array.from(ids), total }
}

type CachedCashflows = { version: number; cashflows: { amount: number; when: string }[] }

const CASHFLOW_CACHE_TTL = 5 * 24 * 60 * 60

function cashflow_cache_key(user_id: string, account_ids: string[]): string {
  const hash = createHash('sha256')
    .update([...account_ids].sort().join(','))
    .digest('hex')
    .slice(0, 16)
  return `xirr_cashflows:${user_id}:${hash}`
}

async function fetch_subtree_cashflows(user_id: string, account_ids: string[]): Promise<{ amount: number; when: Date }[]> {
  // Every line item of each matched transaction must be fetched — null-remainder
  // normalization needs the full balanced set — but only the fields it reads.
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      user_id,
      ...NOT_FUTURE,
      line_items: { some: { accounting_head_id: { in: account_ids } } },
    },
    select: {
      datetime: true,
      line_items: {
        select: {
          accounting_head_id: true,
          datetime: true,
          quantity: true,
          txn_value: true,
          accounting_head: { select: { type: true } },
          asset: { select: { id: true, type: true, name: true } },
        },
      },
    },
  })

  const subtreeIdSet = new Set(account_ids)
  const cashflows: { amount: number; when: Date }[] = []
  for (const tx of rawTransactions) {
    for (const li of normalize_line_items(tx.line_items)) {
      if (!subtreeIdSet.has(li.accounting_head_id)) continue
      cashflows.push({
        amount: -li.txn_value.toNumber(),
        when: li.datetime ?? tx.datetime,
      })
    }
  }
  return cashflows
}

export async function compute_xirr_for_accounts(user_id: string, account_ids: string[], current_value: number): Promise<number | null> {
  if (account_ids.length === 0 || current_value === 0) return null

  // Cache the price-independent cashflow list (never the XIRR itself — its terminal
  // flow moves with market prices), versioned by the counter every write path bumps.
  let cashflows: { amount: number; when: Date }[] | null = null
  const cacheKey = cashflow_cache_key(user_id, account_ids)
  let version = 0
  try {
    const [versionRaw, cachedRaw] = await redis.mget(cashflows_version_key(user_id), cacheKey)
    version = versionRaw ? parseInt(versionRaw, 10) : 0
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as CachedCashflows
      if (cached.version === version) {
        cashflows = cached.cashflows.map(c => ({ amount: c.amount, when: new Date(c.when) }))
      }
    }
  } catch (err) {
    logger.warn({ err }, 'xirr cashflow cache read failed; computing from DB')
  }

  if (cashflows === null) {
    cashflows = await fetch_subtree_cashflows(user_id, account_ids)
    try {
      const payload: CachedCashflows = {
        version,
        cashflows: cashflows.map(c => ({ amount: c.amount, when: c.when.toISOString() })),
      }
      await redis.setex(cacheKey, CASHFLOW_CACHE_TTL, JSON.stringify(payload))
    } catch (err) {
      logger.warn({ err }, 'xirr cashflow cache write failed')
    }
  }

  if (cashflows.length === 0) return null
  const xirr = calculate_xirr([...cashflows, { amount: current_value, when: new Date() }])
  return xirr ?? null
}
