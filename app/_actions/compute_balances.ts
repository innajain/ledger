'use server'

import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { normalize_txn } from '../_utils/normalize_txn'
import { get_current_user_id } from '@/app/_actions/auth'

export async function get_or_compute_balances(invalidate_cache = false) {
  const user_id = await get_current_user_id()
  if (!user_id) throw new Error('unauthorized')
  const cache_key = `balances:${user_id}`

  const cached = invalidate_cache ? null : await redis.get(cache_key)
  if (cached) {
    const parsed = JSON.parse(cached)
    const accountsToAssets = new Map<string, Map<string, { qty: number; book_value: number }>>(
      parsed.accountsToAssets.map(([k, v]: [string, [string, { qty: number; book_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, book_value: v2.book_value }])),
      ]),
    )
    const assetsToAccounts = new Map<string, Map<string, { qty: number; book_value: number }>>(
      parsed.assetsToAccounts.map(([k, v]: [string, [string, { qty: number; book_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, book_value: v2.book_value }])),
      ]),
    )
    return { accountsToAssets, assetsToAccounts }
  }

  const transactions = await prisma.transaction.findMany({
    where: { user_id },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  for (const tx of transactions) {
    normalize_txn(tx)
  }

  const accountsToAssets = new Map<string, Map<string, { qty: Prisma.Decimal; book_value: Prisma.Decimal }>>()
  const assetsToAccounts = new Map<string, Map<string, { qty: Prisma.Decimal; book_value: Prisma.Decimal }>>()

  for (const tx of transactions) {
    for (const li of tx.line_items) {
      const acc_id = li.account_id
      const asset_id = li.asset_id
      const qty = li.quantity!
      const book_value = li.book_value!

      if (!accountsToAssets.has(acc_id)) accountsToAssets.set(acc_id, new Map())
      const assetMap = accountsToAssets.get(acc_id)!
      if (!assetMap.has(asset_id)) assetMap.set(asset_id, { qty, book_value })
      else {
        const existing = assetMap.get(asset_id)!
        assetMap.set(asset_id, {
          qty: existing.qty.add(qty),
          book_value: existing.book_value.add(book_value),
        })
      }

      if (li.account.type === 'real') {
        if (!assetsToAccounts.has(asset_id)) assetsToAccounts.set(asset_id, new Map())
        const accMap = assetsToAccounts.get(asset_id)!
        if (!accMap.has(acc_id)) accMap.set(acc_id, { qty, book_value })
        else {
          const existing_acc = accMap.get(acc_id)!
          accMap.set(acc_id, {
            qty: existing_acc.qty.add(qty),
            book_value: existing_acc.book_value.add(book_value),
          })
        }
      }
    }
  }

  const clientAccountsToAssets = new Map<string, Map<string, { qty: number; book_value: number }>>()
  for (const [k, v] of accountsToAssets.entries()) {
    clientAccountsToAssets.set(
      k,
      new Map<string, { qty: number; book_value: number }>(
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), book_value: v2.book_value.toNumber() }]),
      ),
    )
  }

  const clientAssetsToAccounts = new Map<string, Map<string, { qty: number; book_value: number }>>()
  for (const [k, v] of assetsToAccounts.entries()) {
    clientAssetsToAccounts.set(
      k,
      new Map<string, { qty: number; book_value: number }>(
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), book_value: v2.book_value.toNumber() }]),
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
}
