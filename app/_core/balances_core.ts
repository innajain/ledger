import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { invalidate_timeseries, type TouchedEntities } from '@/app/_utils/value_timeseries'

const balance_cache_key = (user_id: string) => `balances:${user_id}`

export type BalanceMaps = {
  accountsToAssets: Map<string, Map<string, { qty: number; txn_value: number }>>
  assetsToAccounts: Map<string, Map<string, { qty: number; txn_value: number }>>
}

export async function invalidate_balances(user_id: string, touched?: TouchedEntities): Promise<void> {
  await Promise.all([redis.del(balance_cache_key(user_id)), invalidate_timeseries(user_id, touched)])
}

export async function compute_balances_core(user_id: string, invalidate_cache = false): Promise<BalanceMaps> {
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

  // Narrow select: normalization only needs head type and asset {id,type,name};
  // full relation rows here multiply the payload of the hottest recompute in the app.
  const rawTransactions = await prisma.transaction.findMany({
    where: { user_id },
    select: {
      line_items: {
        select: {
          accounting_head_id: true,
          asset_id: true,
          quantity: true,
          txn_value: true,
          accounting_head: { select: { type: true } },
          asset: { select: { id: true, type: true, name: true } },
        },
      },
    },
  })
  const transactions = rawTransactions.map(t => ({ line_items: normalize_line_items(t.line_items) }))

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
    5 * 24 * 60 * 60,
    JSON.stringify({
      accountsToAssets: Array.from(clientAccountsToAssets.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
      assetsToAccounts: Array.from(clientAssetsToAccounts.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
    }),
  )

  return { accountsToAssets: clientAccountsToAssets, assetsToAccounts: clientAssetsToAccounts }
}

export type ClosingBalanceRow = { head_id: string; asset_id: string; qty: number; value: number }

// Historical closing balance strictly before `cutoff`, computed from normalized
// transactions so derived-remainder lines count — correct for every head type,
// not just accounts. Values are book values (txn_value), not marked to market.
// head_id null = all account-type heads; a specific head_id can be any type.
export async function closing_balance_core(user_id: string, head_id: string | null, cutoff: Date): Promise<ClosingBalanceRow[]> {
  // Keep every line item of each matched transaction — null-remainder normalization
  // needs the full balanced set — but select only the fields it reads.
  const txns = await prisma.transaction.findMany({
    where: {
      user_id,
      ...(head_id ? { line_items: { some: { accounting_head_id: head_id } } } : {}),
      // A transaction only contributes lines with effective date (li.datetime ?? txn.datetime)
      // before the cutoff — prune the rest in SQL; the JS filter below stays authoritative.
      OR: [{ datetime: { lt: cutoff } }, { line_items: { some: { datetime: { lt: cutoff } } } }],
    },
    select: {
      datetime: true,
      line_items: {
        select: {
          accounting_head_id: true,
          asset_id: true,
          quantity: true,
          txn_value: true,
          datetime: true,
          accounting_head: { select: { type: true } },
          asset: { select: { id: true, type: true, name: true } },
        },
      },
    },
  })

  const acc = new Map<string, { qty: number; value: number }>()
  for (const t of txns) {
    for (const li of normalize_line_items(t.line_items)) {
      if ((li.datetime ?? t.datetime) >= cutoff) continue
      if (head_id ? li.accounting_head_id !== head_id : li.accounting_head.type !== 'account') continue
      const key = `${li.accounting_head_id}:${li.asset_id}`
      const e = acc.get(key) ?? { qty: 0, value: 0 }
      e.qty += li.quantity.toNumber()
      e.value += li.txn_value.toNumber()
      acc.set(key, e)
    }
  }

  return [...acc].map(([key, bal]) => {
    const [hid, asset_id] = key.split(':')
    return { head_id: hid, asset_id, qty: Math.round(bal.qty * 10000) / 10000, value: Math.round(bal.value * 100) / 100 }
  })
}
