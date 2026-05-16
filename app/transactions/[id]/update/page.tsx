import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { update_transaction } from '@/app/_actions/transactions_update'
import { get_line_item_defaults } from '@/app/_actions/preferences'
import { get_signed_get_url } from '@/app/_utils/s3'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return <div>Please log in.</div>

  const tx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } }, attachments: true },
  })
  if (!tx) return <div>Transaction not found.</div>

  // For now reuse the ClientPage to show transaction and provide an Edit entry point.
  const txForClient = {
    id: tx.id,
    date: tx.datetime,
    description: tx.description,
    total: tx.line_items.reduce((s, li) => s + (li.txn_value ? Number(li.txn_value.toString()) : 0), 0),
    line_items: tx.line_items.map(li => ({
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      account_type: li.account.type,
      asset_id: li.asset.id,
      asset_name: li.asset.name,
      description: li.description ?? null,
      datetime: li.datetime,
      quantity: li.quantity === null ? null : li.quantity.toNumber(),
      txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
    })),
  }
  const [accounts, assets, defaults] = await Promise.all([
    prisma.account.findMany({
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
  }))
  const assetsForClient = assets.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }))

  const attachmentsForClient = await Promise.all(
    tx.attachments.map(async a => ({
      id: a.id,
      url: await get_signed_get_url(a.pathname),
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
    })),
  )

  return (
    <ClientPage
      transaction={txForClient}
      accounts={accountsForClient}
      assets={assetsForClient}
      defaults={defaults}
      updateTransaction={update_transaction}
      existingAttachments={attachmentsForClient}
      attachmentsEnabled={!!process.env.S3_ENDPOINT}
    />
  )
}

export default profile('/transactions/[id]/update', Page)
