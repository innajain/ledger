import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user, is_current_user_admin } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'
import { value_balance_entry } from '../_utils/head_value'
import { calculate_xirr } from '../_utils/xirr_calculator'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Assets',
  description: 'View and manage all your financial assets',
}

async function Page() {
  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title="Assets" />
  }

  const [assets, { assetsToAccounts: balances }, isAdmin, all_line_items] = await Promise.all([
    prisma.asset.findMany({
      include: { parent: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_or_compute_balances(),
    is_current_user_admin(),
    // XIRR cashflows only need the account-line flows of non-rupees assets — rupees
    // assets never produce an XIRR and would drag in most of the ledger.
    prisma.line_item.findMany({
      where: {
        accounting_head: { type: 'account' },
        transaction: { user_id: user.id, is_future: false },
        asset: { type: { not: asset_type.rupees } },
      },
      select: {
        asset_id: true,
        txn_value: true,
        datetime: true,
        transaction: { select: { datetime: true } },
      },
    }),
  ])

  // Assets absent from the balances map contribute zero to every total here, so their
  // prices are never consulted — don't fetch the whole shared catalog's quotes.
  const priceByAsset = await get_prices_for_assets(assets.filter(a => balances.has(a.id)))

  const currValuesByAsset: Map<string, number> = new Map()
  for (const ass of assets) {
    const price = priceByAsset.get(ass.id)?.price ?? null
    const acc_qty_map = balances.get(ass.id) ?? new Map<string, { qty: number; txn_value: number }>()

    let total_value = new Prisma.Decimal(0)
    for (const [, { qty, txn_value }] of acc_qty_map) {
      total_value = total_value.add(value_balance_entry(qty, txn_value, price))
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

  const lineItemsByAsset = new Map<string, typeof all_line_items>()
  for (const li of all_line_items) {
    const arr = lineItemsByAsset.get(li.asset_id)
    if (arr) arr.push(li)
    else lineItemsByAsset.set(li.asset_id, [li])
  }

  const xirrByAsset = new Map<string, number | null>()
  for (const asset of assets) {
    const assetLineItems = lineItemsByAsset.get(asset.id) ?? []
    const currentValue = currValuesByAsset.get(asset.id) ?? 0
    if (asset.type === asset_type.rupees || assetLineItems.length === 0 || currentValue === 0) {
      xirrByAsset.set(asset.id, null)
      continue
    }
    const cashflows: { amount: number; when: Date }[] = []
    for (const li of assetLineItems) {
      // Write validation keeps txn_value non-null on non-rupees account lines, so the
      // stored value equals the normalized one; skip any legacy row that violates it.
      if (li.txn_value === null) continue
      cashflows.push({ amount: -li.txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime })
    }
    cashflows.push({ amount: currentValue, when: new Date() })
    xirrByAsset.set(asset.id, calculate_xirr(cashflows))
  }

  return (
    <ClientPage
      assets={assets}
      assetAccountQuantities={assetAccountQuantities}
      totals={currValuesByAsset}
      xirrByAsset={xirrByAsset}
      isAdmin={isAdmin}
    />
  )
}

export default profile('/assets', Page)
