import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'
import { normalize_txn } from '../_utils/normalize_txn'
import { calculate_xirr } from '../_utils/xirr_calculator'
import { profile } from '@/lib/metrics/profile'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Assets',
  description: 'View and manage all your financial assets',
}

async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Assets</h1>
        <p>Please log in to view assets.</p>
      </div>
    )
  }

  const [assets, { assetsToAccounts: balances }] = await Promise.all([
    prisma.asset.findMany({
      where: { user_id: user.id },
      include: { parent: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_or_compute_balances(),
  ])

  const priceByAsset = await get_prices_for_assets(assets)

  const currValuesByAsset: Map<string, number> = new Map()
  for (const ass of assets) {
    const price_data = priceByAsset.get(ass.id) ?? null
    const acc_qty_map = balances.get(ass.id) ?? new Map<string, { qty: number; txn_value: number }>()

    let total_value = new Prisma.Decimal(0)
    for (const [, { qty, txn_value }] of acc_qty_map.entries()) {
      if (price_data) {
        total_value = total_value.add(new Prisma.Decimal(price_data.price).mul(qty))
      } else {
        total_value = total_value.add(txn_value)
      }
    }

    currValuesByAsset.set(ass.id, total_value.toNumber())
  }

  const assetAccountQuantities: Map<string, Map<string, number>> = new Map()
  balances.forEach((acc_qty_map, asset_id) => {
    const accQuantities: Map<string, number> = new Map()
    acc_qty_map.forEach(({ qty }, acc_id) => {
      accQuantities.set(acc_id, qty)
    })
    assetAccountQuantities.set(asset_id, accQuantities)
  })

  const asset_ids = assets.map(a => a.id)
  const all_line_items = await prisma.line_item.findMany({
    where: { asset_id: { in: asset_ids }, accounting_head: { type: 'account' } },
    include: { transaction: true },
  })
  const tx_ids = Array.from(new Set(all_line_items.map(li => li.transaction_id)))
  const normalizedById = new Map<string, { txn_value: Prisma.Decimal }>()
  if (tx_ids.length > 0) {
    const rawTxns = await prisma.transaction.findMany({
      where: { id: { in: tx_ids } },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    })
    for (const tx of rawTxns.map(normalize_txn)) {
      for (const li of tx.line_items) normalizedById.set(li.id, { txn_value: li.txn_value! })
    }
  }

  const xirrByAsset = new Map<string, number | null>()
  for (const asset of assets) {
    const assetLineItems = all_line_items.filter(li => li.asset_id === asset.id)
    const currentValue = currValuesByAsset.get(asset.id) ?? 0
    if (asset.type === asset_type.rupees || assetLineItems.length === 0 || currentValue === 0) {
      xirrByAsset.set(asset.id, null)
      continue
    }
    const cashflows: { amount: number; when: Date }[] = []
    for (const li of assetLineItems) {
      const n = normalizedById.get(li.id)
      if (!n) continue
      cashflows.push({ amount: -n.txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime })
    }
    cashflows.push({ amount: currentValue, when: new Date() })
    xirrByAsset.set(asset.id, calculate_xirr(cashflows))
  }

  return <ClientPage assets={assets} assetAccountQuantities={assetAccountQuantities} totals={currValuesByAsset} xirrByAsset={xirrByAsset} />
}

export default profile('/assets', Page)
