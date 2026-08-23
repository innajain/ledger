import ClientPage from './ClientPage'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { get_editor_context } from '@/app/_utils/links'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function Page({ params }: { params: Promise<{ id: string }> }) {
  const link_id = (await params).id
  const user_id = await get_current_user_id()
  if (!user_id) {
    return <LoggedOutNotice title="Requests" />
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

  // Heads/assets the request itself references have to resolve even when archived — the mirrored
  // and prefilled lines are built from them, and an unresolved one leaves the form unable to tell
  // what kind of line it is.
  const ref_head_ids = [
    ...new Set(
      [
        ctx.reciprocal_head?.id,
        ...ctx.prefill_balancing.map(b => b.accounting_head_id),
        ...ctx.other_locked_lines.map(o => o.accounting_head_id),
      ].filter((id): id is string => !!id),
    ),
  ]
  const ref_asset_ids = [
    ...new Set([
      ...ctx.mirrored_lines.map(m => m.asset_id),
      ...ctx.prefill_balancing.map(b => b.asset_id),
      ...ctx.other_locked_lines.map(o => o.asset_id),
    ]),
  ]

  const [rawAccounts, assets, defaults] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id, OR: [{ is_active: true, is_placeholder: false }, { id: { in: ref_head_ids } }] },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true, linked_user_id: true },
    }),
    prisma.asset.findMany({
      where: { OR: [{ is_active: true, is_placeholder: false }, { id: { in: ref_asset_ids } }] },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      select: { id: true, name: true, type: true },
    }),
    get_line_item_defaults(),
  ])

  const accounts = rawAccounts.map(a => ({ id: a.id, name: a.name, type: a.type, linked: a.linked_user_id !== null }))

  return <ClientPage ctx={ctx} accounts={accounts} assets={assets} defaults={defaults} />
}

export default profile('/requests/[id]', Page)
