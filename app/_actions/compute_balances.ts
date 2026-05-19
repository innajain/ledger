import 'server-only'
import { cache } from 'react'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { normalize_txn } from '../_utils/normalize_txn'
import { get_current_user_id } from '@/app/_actions/auth'
import { invalidate_timeseries } from '@/app/_utils/value_timeseries'

const balance_cache_key = (user_id: string) => `balances:${user_id}`

/**
 * Drop the cached balance map for a user. Call this from any mutation that
 * could invalidate balances — transactions, accounts, assets, line items.
 * Also bumps the user's timeseries version so chart data is recomputed.
 */
export async function invalidate_balances(user_id: string): Promise<void> {
  await Promise.all([redis.del(balance_cache_key(user_id)), invalidate_timeseries(user_id)])
}

export const get_or_compute_balances = cache(async (invalidate_cache = false) => {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('unauthorized')
  const cache_key = balance_cache_key(user_id)

  const cached = invalidate_cache ? null : await redis.get(cache_key)
  if (cached) {
    const parsed = JSON.parse(cached)
    const accountsToAssets = new Map<string, Map<string, { qty: number; txn_value: number }>>(
      parsed.accountsToAssets.map(([k, v]: [string, [string, { qty: number; txn_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, txn_value: v2.txn_value }])),
      ]),
    )
    const assetsToAccounts = new Map<string, Map<string, { qty: number; txn_value: number }>>(
      parsed.assetsToAccounts.map(([k, v]: [string, [string, { qty: number; txn_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, txn_value: v2.txn_value }])),
      ]),
    )
    return { accountsToAssets, assetsToAccounts }
  }

  const rawTransactions = await prisma.transaction.findMany({
    where: { user_id },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
  const transactions = rawTransactions.map(normalize_txn)

  const accountsToAssets = new Map<string, Map<string, { qty: Prisma.Decimal; txn_value: Prisma.Decimal }>>()
  const assetsToAccounts = new Map<string, Map<string, { qty: Prisma.Decimal; txn_value: Prisma.Decimal }>>()

  for (const tx of transactions) {
    for (const li of tx.line_items) {
      const acc_id = li.accounting_head_id
      const asset_id = li.asset_id
      const qty = li.quantity
      const txn_value = li.txn_value

      if (!accountsToAssets.has(acc_id)) accountsToAssets.set(acc_id, new Map())
      const assetMap = accountsToAssets.get(acc_id)!
      if (!assetMap.has(asset_id)) assetMap.set(asset_id, { qty, txn_value })
      else {
        const existing = assetMap.get(asset_id)!
        assetMap.set(asset_id, {
          qty: existing.qty.add(qty),
          txn_value: existing.txn_value.add(txn_value),
        })
      }

      if (li.accounting_head.type === 'account') {
        if (!assetsToAccounts.has(asset_id)) assetsToAccounts.set(asset_id, new Map())
        const accMap = assetsToAccounts.get(asset_id)!
        if (!accMap.has(acc_id)) accMap.set(acc_id, { qty, txn_value })
        else {
          const existing_acc = accMap.get(acc_id)!
          accMap.set(acc_id, {
            qty: existing_acc.qty.add(qty),
            txn_value: existing_acc.txn_value.add(txn_value),
          })
        }
      }
    }
  }

  const clientAccountsToAssets = new Map<string, Map<string, { qty: number; txn_value: number }>>()
  for (const [k, v] of accountsToAssets.entries()) {
    clientAccountsToAssets.set(
      k,
      new Map<string, { qty: number; txn_value: number }>(
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), txn_value: v2.txn_value.toNumber() }]),
      ),
    )
  }

  const clientAssetsToAccounts = new Map<string, Map<string, { qty: number; txn_value: number }>>()
  for (const [k, v] of assetsToAccounts.entries()) {
    clientAssetsToAccounts.set(
      k,
      new Map<string, { qty: number; txn_value: number }>(
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), txn_value: v2.txn_value.toNumber() }]),
      ),
    )
  }

  await redis.setex(
    cache_key,
    5 * 24 * 60 * 60, // Expire in 5 days
    JSON.stringify({
      accountsToAssets: Array.from(clientAccountsToAssets.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
      assetsToAccounts: Array.from(clientAssetsToAccounts.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
    }),
  )

  return { accountsToAssets: clientAccountsToAssets, assetsToAccounts: clientAssetsToAccounts }
})
