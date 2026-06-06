import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { Prisma } from '@/generated/prisma/client'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { get_transaction_status, get_cancellable_links } from '@/app/_utils/links'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return <div>Please log in.</div>

  const rawTx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, accounting_head: true } }, attachments: true },
  })
  if (!rawTx) return <div>Transaction not found.</div>

  const tx = normalize_txn(rawTx)
  const [linkStatus, cancellable] = await Promise.all([get_transaction_status(user.id, id), get_cancellable_links(user.id, id)])

  const txForClient = {
    id: tx.id,
    date: tx.datetime.toISOString(),
    description: tx.description,
    total: tx.line_items
      .filter(li => li.accounting_head.type === 'account')
      .reduce((sum, li) => sum.add(li.txn_value), new Prisma.Decimal(0))
      .toNumber(),
    attachments: rawTx.attachments.map(a => ({
      id: a.id,
      url: `/api/attachments/${a.id}`,
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
    })),
    line_items: tx.line_items.map(li => ({
      id: li.id,
      accounting_head_id: li.accounting_head.id,
      account_name: li.accounting_head.name,
      accounting_head_type: li.accounting_head.type,
      asset_id: li.asset.id,
      asset_name: li.asset.name,
      asset_type: li.asset.type,
      quantity: li.quantity.toNumber(),
      txn_value: li.txn_value.toNumber(),
      description: li.description,
      datetime: li.datetime,
    })),
  }

  return <ClientPage transaction={txForClient} linkStatus={linkStatus ?? undefined} cancellable={cancellable} />
}

export default profile('/transactions/[id]', Page)
