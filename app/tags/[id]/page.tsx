import { cache } from 'react'
import type { Metadata } from 'next'
import { get_current_user } from '@/app/_actions/auth'
import { get_transaction_tag_core } from '@/app/_core/tags_core'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'
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
  if (!tag)
    return (
      <div className="max-w-md mx-auto mt-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tag not found</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2">It may have been deleted, or the link is stale.</p>
      </div>
    )

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
