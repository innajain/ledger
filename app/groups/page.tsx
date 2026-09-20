import type { Metadata } from 'next'
import { get_current_user } from '@/app/_actions/auth'
import { list_transaction_groups_core } from '@/app/_core/groups_core'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'
import ClientPage from './ClientPage'

export const metadata: Metadata = {
  title: 'Groups',
  description: 'Bundle similar transactions under a label and see what they add up to',
}

async function Page() {
  const user = await get_current_user()
  if (!user) return <LoggedOutNotice title="Groups" />

  const groups = await list_transaction_groups_core(user.id)

  return (
    <ClientPage
      groups={groups.map(g => ({
        ...g,
        created_at: g.created_at.toISOString(),
        last_datetime: g.last_datetime ? g.last_datetime.toISOString() : null,
      }))}
    />
  )
}

export default profile('/groups', Page)
