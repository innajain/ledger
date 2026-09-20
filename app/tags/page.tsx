import type { Metadata } from 'next'
import { get_current_user } from '@/app/_actions/auth'
import { list_transaction_tags_core } from '@/app/_core/tags_core'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'
import ClientPage from './ClientPage'

export const metadata: Metadata = {
  title: 'Tags',
  description: 'Bundle similar transactions under a label and see what they add up to',
}

async function Page() {
  const user = await get_current_user()
  if (!user) return <LoggedOutNotice title="Tags" />

  const tags = await list_transaction_tags_core(user.id)

  return (
    <ClientPage
      tags={tags.map(g => ({
        ...g,
        created_at: g.created_at.toISOString(),
        last_datetime: g.last_datetime ? g.last_datetime.toISOString() : null,
      }))}
    />
  )
}

export default profile('/tags', Page)
