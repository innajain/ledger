'use server'

import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { normalize_txn } from '../_utils/normalize_txn'

export async function get_or_compute_balances(invalidate_cache = false) {
  if (!invalidate_cache && (await redis.exists('balances'))) {
    const cached = (await redis.get('balances'))!
    const balances = new Map<string, Map<string, { qty: number; book_value: number }>>(
      JSON.parse(cached).map(([k, v]: [string, [string, { qty: number; book_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, book_value: v2.book_value }])),
      ]),
    )
    return balances
  }

  const transactions = await prisma.transaction.findMany({
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
        assetMap.set(asset_id, { qty: existing.qty.add(qty), book_value: existing.book_value.add(book_value) })
      }

      if (!balances.has(asset_id)) balances.set(asset_id, new Map())
      const accMap = balances.get(asset_id)!
      if (!accMap.has(acc_id)) accMap.set(acc_id, { qty, book_value })
      else {
        const existing_acc = accMap.get(acc_id)!
        accMap.set(acc_id, { qty: existing_acc.qty.add(qty), book_value: existing_acc.book_value.add(book_value) })
      }
    }
  }

  redis.set(
    'balances',
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
