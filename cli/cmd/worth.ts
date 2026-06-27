import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { compute_balances_core } from '@/app/_core/balances_core'
import { compute_net_worth, subtree_total, compute_xirr_for_accounts } from '@/app/_core/valuation_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { require_session } from '../auth_store'
import { table, money } from '../format'

import { parseArgs } from 'node:util'

export async function cmd_worth(rest: string[]) {
  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, allowPositionals: true })
  const { uid } = await require_session()
  const { networth, allocations } = await compute_net_worth(uid)
  const invest = subtree_total(allocations, 'Investments')
  const savings = subtree_total(allocations, 'Savings')
  const xirr = invest && invest.total !== 0 ? await compute_xirr_for_accounts(uid, invest.ids, invest.total) : null

  if (values.json) {
    console.log(JSON.stringify({ networth, allocations, savings: savings?.total ?? 0, investments: invest?.total ?? 0, xirr }, null, 2))
    return
  }

  console.log(`Net worth:   ${money(networth)}`)

  if (invest) {
    console.log(`Investments: ${money(invest.total)}${xirr != null ? `   (XIRR ${(xirr * 100).toFixed(2)}%)` : ''}`)
  }

  const rows = allocations
    .filter(a => Math.abs(a.total) >= 0.005)
    .sort((a, b) => b.total - a.total)
    .map(a => [a.name, money(a.total)])
  if (rows.length > 0) {
    console.log('\nAllocations:')
    console.log(table(['allocation', 'value'], rows))
  }
}

export async function cmd_holdings(rest: string[]) {
  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, allowPositionals: true })
  const { uid } = await require_session()
  const [{ assetsToAccounts }, assets] = await Promise.all([
    compute_balances_core(uid),
    prisma.asset.findMany({ select: { id: true, name: true, type: true, ticker: true } }),
  ])
  const priceByAsset = await get_prices_for_assets(assets)
  const assetById = new Map(assets.map(a => [a.id, a]))

  const parsedHoldings: Record<string, unknown>[] = []
  let total = 0
  const rows: string[][] = []
  for (const [assetId, accMap] of assetsToAccounts) {
    const asset = assetById.get(assetId)
    if (!asset) continue
    let qty = 0
    let cost = 0
    for (const bal of accMap.values()) {
      qty += bal.qty
      cost += bal.txn_value
    }
    if (Math.abs(qty) < 1e-9) continue
    const priced = priceByAsset.get(assetId)
    const value = compute_current_value(
      asset.type,
      new Prisma.Decimal(qty),
      priced ? new Prisma.Decimal(priced.price) : null,
      new Prisma.Decimal(cost),
    ).toNumber()
    total += value

    if (values.json) {
      parsedHoldings.push({
        asset_id: asset.id,
        asset_name: asset.name,
        asset_type: asset.type,
        asset_ticker: asset.ticker,
        qty,
        cost,
        price: priced ? priced.price : null,
        value,
      })
    } else {
      rows.push([asset.name, asset.type, String(qty), money(cost), priced ? money(priced.price) : '—', money(value)])
    }
  }

  if (values.json) {
    console.log(JSON.stringify({ holdings: parsedHoldings, total }, null, 2))
    return
  }

  rows.sort((a, b) => Number(b[5].replace(/[^\d.-]/g, '')) - Number(a[5].replace(/[^\d.-]/g, '')))
  if (rows.length === 0) {
    console.log('No holdings.')
    return
  }
  console.log(table(['asset', 'type', 'qty', 'cost', 'price', 'value'], rows))
  console.log(`\nTotal holdings value: ${money(total)}`)
}
