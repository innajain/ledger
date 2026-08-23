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

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function Page({ searchParams }: Props) {
  const user = await get_current_user()
  if (!user) return <div>Please log in.</div>

  const [heads, defaults, params] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, is_active: true, is_placeholder: false },
      orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, lock_date: true },
    }),
    get_line_item_defaults(),
    searchParams,
  ])

  const accounts = heads
    .filter(h => h.type === 'account')
    .map(h => ({ id: h.id, name: h.name, lock_date: h.lock_date ? formatInTimeZone(h.lock_date, USER_TIMEZONE, 'yyyy-MM-dd') : null }))

  // ?account=<id> deep link (from an account's detail page) — only honoured when it
  // names one of this user's own selectable accounts, otherwise fall back to no selection
  const requested = Array.isArray(params.account) ? params.account[0] : params.account
  const initialAccountId = requested && accounts.some(a => a.id === requested) ? requested : ''

  return (
    <ClientPage
      // a fresh deep link is a fresh reconcile session — remount so the preselection
      // applies even when arriving from /reconcile?account=<other id>
      key={initialAccountId || 'none'}
      accounts={accounts}
      allocations={heads.filter(h => h.type === 'allocation')}
      incomeExpenses={heads.filter(h => h.type === 'income_expense')}
      defaults={defaults}
      initialAccountId={initialAccountId}
    />
  )
}

export default profile('/reconcile', Page)
