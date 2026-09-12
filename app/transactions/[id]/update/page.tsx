import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { update_transaction } from './transactions_update'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { profile } from '@/lib/metrics/profile'
import { env } from '@/lib/env'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return <LoggedOutNotice title="Transactions" />

  const tx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, accounting_head: true } }, attachments: true },
  })
  if (!tx) return <div>Transaction not found.</div>

  const txForClient = {
    id: tx.id,
    date: tx.datetime,
    description: tx.description,
    total: tx.line_items.reduce((s, li) => s + (li.txn_value ? Number(li.txn_value.toString()) : 0), 0),
    line_items: tx.line_items.map(li => ({
      id: li.id,
      accounting_head_id: li.accounting_head.id,
      account_name: li.accounting_head.name,
      accounting_head_type: li.accounting_head.type,
      asset_id: li.asset.id,
      asset_name: li.asset.name,
      description: li.description ?? null,
      datetime: li.datetime,
      quantity: li.quantity === null ? null : li.quantity.toNumber(),
      txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
    })),
  }
  // A head or asset archived after this transaction was booked still has to come back with the
  // pickers: otherwise the line's <select> renders empty and the form's preview cannot tell what
  // kind of line it is, so it silently mis-derives the rest of the group.
  const ref_head_ids = [...new Set(tx.line_items.map(li => li.accounting_head_id))]
  const ref_asset_ids = [...new Set(tx.line_items.map(li => li.asset_id))]

  const [accounts, assets, defaults] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id, OR: [{ is_active: true, is_placeholder: false }, { id: { in: ref_head_ids } }] },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany({
      where: { OR: [{ is_active: true, is_placeholder: false }, { id: { in: ref_asset_ids } }] },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_line_item_defaults(),
  ])

  const accountsForClient = accounts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }))
  const assetsForClient = assets.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }))

  const attachmentsForClient = tx.attachments.map(a => ({
    id: a.id,
    url: `/api/attachments/${a.id}`,
    filename: a.filename,
    content_type: a.content_type,
    size: a.size,
  }))

  return (
    <ClientPage
      transaction={txForClient}
      accounts={accountsForClient}
      assets={assetsForClient}
      defaults={defaults}
      updateTransaction={update_transaction}
      existingAttachments={attachmentsForClient}
      attachmentsEnabled={!!env.BLOB_READ_WRITE_TOKEN}
    />
  )
}

export default profile('/transactions/[id]/update', Page)
