import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { accounting_head_type } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_or_compute_balances } from '../_actions/compute_balances'
import { compute_head_value } from '../_utils/head_value'
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
        <p>Please log in to view income & expenses.</p>
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

  const totals = new Map(accounts.map(acc => [acc.id, compute_head_value(balances.get(acc.id) ?? new Map(), priceByAsset).toNumber()]))

  return <ClientPage accounts={accounts} totals={totals} />
}

export default profile('/income_expenses', Page)
