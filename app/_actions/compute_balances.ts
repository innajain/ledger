'use server'

import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { normalize_txn } from '../_utils/normalize_txn'
import { get_current_user } from '@/app/_actions/auth'

export async function get_or_compute_balances(invalidate_cache = false) {
  const user = await get_current_user()
  if (!user) throw new Error('unauthorized')
  const cache_key = `balances:${user.id}`

  if (!invalidate_cache && (await redis.exists(cache_key))) {
    const cached = (await redis.get(cache_key))!
    const balances = new Map<string, Map<string, { qty: number; book_value: number }>>(
      JSON.parse(cached).map(([k, v]: [string, [string, { qty: number; book_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, book_value: v2.book_value }])),
      ]),
    )
    return balances
  }

  const transactions = await prisma.transaction.findMany({
    where: { user_id: user.id },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  for (const tx of transactions) {
    normalize_txn(tx)
  }
  //   account, asset, qty and asset, account, qty
  const balances = new Map<string, Map<string, { qty: Prisma.Decimal; book_value: Prisma.Decimal }>>()

  for (const tx of transactions) {
    for (const li of tx.line_items) {
      const acc_id = li.account_id
      const asset_id = li.asset_id
      const qty = li.quantity!
      const book_value = li.book_value!

      if (!balances.has(acc_id)) balances.set(acc_id, new Map())
      const assetMap = balances.get(acc_id)!
      if (!assetMap.has(asset_id)) assetMap.set(asset_id, { qty, book_value })
      else {
        const existing = assetMap.get(asset_id)!
        assetMap.set(asset_id, {
          qty: existing.qty.add(qty),
          book_value: existing.book_value.add(book_value),
        })
      }

      if (li.account.type === 'real') {
        if (!balances.has(asset_id)) balances.set(asset_id, new Map())
        const accMap = balances.get(asset_id)!
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

  redis.setex(
    cache_key,
    5 * 24 * 60 * 60, // Expire in 5 days
    JSON.stringify(
      Array.from(balances.entries()).map(([k, v]) => [
        k,
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), book_value: v2.book_value.toNumber() }]),
      ]),
    ),
  )

  //   convert balances to Map<string, Map<string, number>> for easier consumption by client
  const balances_for_client = new Map<string, Map<string, { qty: number; book_value: number }>>()
  for (const [k, v] of balances.entries()) {
    balances_for_client.set(
      k,
      new Map<string, { qty: number; book_value: number }>(
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), book_value: v2.book_value.toNumber() }]),
      ),
    )
  }
  return balances_for_client
}
