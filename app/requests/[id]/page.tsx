import ClientPage from './ClientPage'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { get_editor_context } from '@/app/_utils/links'
import { profile } from '@/lib/metrics/profile'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function Page({ params }: { params: Promise<{ id: string }> }) {
  const link_id = (await params).id
  const user_id = await get_current_user_id()
  if (!user_id) {
    return <div className="p-2 text-slate-600 dark:text-slate-400">Please log in.</div>
  }

  const ctx = await get_editor_context(user_id, link_id)
  if (!ctx) {
    return (
      <div className="space-y-3">
        <p className="text-slate-700 dark:text-slate-300">This request isn’t awaiting your action.</p>
        <Link href="/requests" className="text-blue-600 dark:text-blue-400 hover:underline">
          ← Back to requests
        </Link>
      </div>
    )
  }

  const [rawAccounts, assets, defaults] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id, is_active: true, is_placeholder: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, linked_user_id: true },
    }),
    prisma.asset.findMany({
      where: { is_active: true, is_placeholder: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true },
    }),
    get_line_item_defaults(),
  ])
  // Tag linked (person) accounts so the editor only offers your own non-linked
  // accounts for balancing, while still rendering the locked linked rows.
  const accounts = rawAccounts.map(a => ({ id: a.id, name: a.name, type: a.type, linked: a.linked_user_id !== null }))

  return <ClientPage ctx={ctx} accounts={accounts} assets={assets} defaults={defaults} />
}

export default profile('/requests/[id]', Page)
