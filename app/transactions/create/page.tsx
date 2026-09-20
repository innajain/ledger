import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { list_tag_names_core } from '@/app/_core/tags_core'
import { profile } from '@/lib/metrics/profile'
import { env } from '@/lib/env'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

async function Page() {
  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title="Transactions" />
  }

  const [accounts, assets, defaults, tags] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, is_active: true, is_placeholder: false },
      select: { id: true, name: true, type: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany({
      where: { is_active: true, is_placeholder: false },
      select: { id: true, name: true, type: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_line_item_defaults(),
    list_tag_names_core(user.id),
  ])

  return <ClientPage accounts={accounts} assets={assets} defaults={defaults} tags={tags} attachmentsEnabled={!!env.BLOB_READ_WRITE_TOKEN} />
}

export default profile('/transactions/create', Page)
