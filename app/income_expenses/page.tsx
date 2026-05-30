import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { accounting_head_type, Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'
import { profile } from '@/lib/metrics/profile'

// Route segment config for performance
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Income & Expenses',
  description: 'View and manage your income and expense accounts',
}

async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Income / Expense</h1>
        <p>Please log in to view nominal accounts.</p>
      </div>
    )
  }
  const [[accounts, assets], { accountsToAssets: balances }] = await Promise.all([
    prisma.$transaction([
      prisma.accounting_head.findMany({
        where: { user_id: user.id, type: accounting_head_type.income_expense },
        include: { parent: true },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      }),
      prisma.asset.findMany(),
    ]),
    get_or_compute_balances(),
  ])

  const priceByAsset = await get_prices_for_assets(assets)

  const totalsByAccount: Map<string, Prisma.Decimal> = new Map()
  for (const acc of accounts) {
    const asset_qty_map = balances.get(acc.id) ?? new Map<string, { qty: number; txn_value: number }>()

    let total_value = new Prisma.Decimal(0)
    for (const [asset_id, { qty, txn_value }] of asset_qty_map.entries()) {
      const price_data = priceByAsset.get(asset_id) ?? null
      if (price_data) {
        total_value = total_value.add(new Prisma.Decimal(price_data.price).mul(qty))
      } else {
        total_value = total_value.add(txn_value)
      }
    }

    totalsByAccount.set(acc.id, total_value)
  }

  return <ClientPage accounts={accounts} totals={new Map(totalsByAccount.entries().map(([accId, total]) => [accId, total.toNumber()]))} />
}

export default profile('/income_expenses', Page)
