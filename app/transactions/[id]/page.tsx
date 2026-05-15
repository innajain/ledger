import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { Prisma } from '@/generated/prisma/client'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { profile } from '@/lib/metrics/profile'

type Props = { params: Promise<{ id: string }> }

async function Page({ params }: Props) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) return <div>Please log in.</div>

  const rawTx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } } },
  })
  if (!rawTx) return <div>Transaction not found.</div>

  const tx = normalize_txn(rawTx)

  const txForClient = {
    id: tx.id,
    date: tx.datetime.toISOString(),
    description: tx.description,
    total: tx.line_items
      .filter(li => li.account.type === 'real')
      .reduce((sum, li) => sum.add(li.book_value), new Prisma.Decimal(0))
      .toNumber(),
    line_items: tx.line_items.map(li => ({
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      account_type: li.account.type,
      asset_id: li.asset.id,
      asset_name: li.asset.name,
      asset_type: li.asset.type,
      quantity: li.quantity.toNumber(),
      book_value: li.book_value.toNumber(),
      description: li.description,
      datetime: li.datetime,
    })),
  }

  return <ClientPage transaction={txForClient} />
}

export default profile('/transactions/[id]', Page)
