import { redirect } from 'next/navigation'
import { get_current_user } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { prisma } from '@/lib/prisma'
import ClientPage from './ClientPage'
import { profile } from '@/lib/metrics/profile'

export const metadata = {
  title: 'Settings',
}

async function SettingsPage() {
  const user = await get_current_user()

  if (!user) {
    redirect('/login')
  }

  const [accounts, assets, defaults, inactiveAccounts, inactiveAssets, userRow] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, is_active: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true },
    }),
    prisma.asset.findMany({
      where: { user_id: user.id, is_active: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    get_line_item_defaults(),
    prisma.accounting_head.findMany({
      where: { user_id: user.id, is_active: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, is_placeholder: true },
    }),
    prisma.asset.findMany({
      where: { user_id: user.id, is_active: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, is_placeholder: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { is_admin: true } }),
  ])

  return (
    <ClientPage
      user={user}
      isAdmin={userRow?.is_admin ?? false}
      accounts={accounts}
      assets={assets}
      defaults={defaults}
      inactiveAccounts={inactiveAccounts}
      inactiveAssets={inactiveAssets}
    />
  )
}

export default profile('/settings', SettingsPage)
