import { redirect } from 'next/navigation'
import { get_current_user } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { prisma } from '@/lib/prisma'
import ClientPage from './ClientPage'

export const metadata = {
  title: 'Settings',
}

export default async function SettingsPage() {
  const user = await get_current_user()

  if (!user) {
    redirect('/login')
  }

  const [accounts, assets, defaults, inactiveAccounts, inactiveAssets] = await Promise.all([
    prisma.account.findMany({
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
    prisma.account.findMany({
      where: { user_id: user.id, is_active: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, is_placeholder: true },
    }),
    prisma.asset.findMany({
      where: { user_id: user.id, is_active: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, is_placeholder: true },
    }),
  ])

  return (
    <ClientPage
      user={user}
      accounts={accounts}
      assets={assets}
      defaults={defaults}
      inactiveAccounts={inactiveAccounts}
      inactiveAssets={inactiveAssets}
    />
  )
}
