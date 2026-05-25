import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { profile } from '@/lib/metrics/profile'

async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Create Transaction</h1>
        <p>Please log in to create transactions.</p>
      </div>
    )
  }

  const [accounts, assets, defaults] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, is_active: true, is_placeholder: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany({
      where: { user_id: user.id, is_active: true, is_placeholder: false },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_line_item_defaults(),
  ])

  const accountsForClient = accounts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    upi_id: a.upi_id,
  }))
  const assetsForClient = assets.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }))

  return (
    <ClientPage accounts={accountsForClient} assets={assetsForClient} defaults={defaults} attachmentsEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} />
  )
}

export default profile('/transactions/create', Page)
