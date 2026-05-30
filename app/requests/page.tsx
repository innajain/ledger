import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { get_inbox } from '@/app/_utils/links'
import { profile } from '@/lib/metrics/profile'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Requests',
  description: 'Approval requests for shared transactions',
}

async function Page() {
  const user_id = await get_current_user_id()
  if (!user_id) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Requests</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Please log in to view requests.</p>
      </div>
    )
  }
  const [items, accounts] = await Promise.all([
    get_inbox(user_id),
    // Only the user's own (non-linked) accounts can absorb the balancing —
    // never a linked/person account (that would net to zero).
    prisma.accounting_head.findMany({
      where: { user_id, type: 'account', is_active: true, is_placeholder: false, linked_user_id: null },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
  ])
  return <ClientPage items={items} accounts={accounts} />
}

export default profile('/requests', Page)
