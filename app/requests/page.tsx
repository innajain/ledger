import ClientPage from './ClientPage'
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
  const items = await get_inbox(user_id)
  return <ClientPage items={items} />
}

export default profile('/requests', Page)
