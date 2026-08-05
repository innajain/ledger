import type { Metadata } from 'next'
import { formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import ClientPage from './ClientPage'
import { profile } from '@/lib/metrics/profile'

export const metadata: Metadata = {
  title: 'Reconcile',
  description: 'Match a bank statement against your ledger',
}

async function Page() {
  const user = await get_current_user()
  if (!user) return <div>Please log in.</div>

  const [heads, defaults] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, is_active: true, is_placeholder: false },
      orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, lock_date: true },
    }),
    get_line_item_defaults(),
  ])

  return (
    <ClientPage
      accounts={heads
        .filter(h => h.type === 'account')
        .map(h => ({ id: h.id, name: h.name, lock_date: h.lock_date ? formatInTimeZone(h.lock_date, USER_TIMEZONE, 'yyyy-MM-dd') : null }))}
      allocations={heads.filter(h => h.type === 'allocation')}
      incomeExpenses={heads.filter(h => h.type === 'income_expense')}
      defaults={defaults}
    />
  )
}

export default profile('/reconcile', Page)
