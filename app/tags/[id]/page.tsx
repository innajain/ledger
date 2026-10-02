import { cache } from 'react'
import type { Metadata } from 'next'
import { get_current_user } from '@/app/_actions/auth'
import { get_transaction_tag_core } from '@/app/_core/tags_core'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'
import { NotFound } from '@/app/_components/NotFound'
import ClientPage from './ClientPage'

type Props = { params: Promise<{ id: string }> }

// react.cache so generateMetadata and Page share one fetch per request.
const get_tag = cache((user_id: string, id: string) => get_transaction_tag_core(user_id, id))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return { title: 'Tag' }
  const tag = await get_tag(user.id, id)
  return { title: tag?.name ?? 'Tag' }
}

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return <LoggedOutNotice title="Tags" />

  const tag = await get_tag(user.id, id)
  if (!tag) return <NotFound title="Tag not found" backHref="/tags" backLabel="Back to tags" />

  return (
    <ClientPage
      tag={{
        id: tag.id,
        name: tag.name,
        description: tag.description,
        summary: tag.summary,
        transactions: tag.transactions.map(t => ({ ...t, datetime: t.datetime.toISOString() })),
      }}
    />
  )
}

export default profile('/tags/[id]', Page)
