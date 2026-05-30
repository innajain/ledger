import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { delete_account } from '@/app/_actions/resources'
import type { Prisma } from '@/generated/prisma/client'
import { profile } from '@/lib/metrics/profile'

async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Update Account</h1>
        <p>User not authenticated.</p>
      </div>
    )
  }
  const account = await prisma.accounting_head.findUnique({
    where: { id, user_id: user.id, type: 'account' },
  })
  if (!account) {
    return (
      <div>
        <h1>Update Account</h1>
        <p>Account not found.</p>
      </div>
    )
  }

  const linkedUsername = account.linked_user_id
    ? ((await prisma.user.findUnique({ where: { id: account.linked_user_id }, select: { username: true } }))?.username ?? null)
    : null

  const parents: Prisma.accounting_headGetPayload<Record<string, never>>[] = user
    ? await prisma.accounting_head.findMany({
        where: { user_id: user.id, type: 'account' },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      })
    : []

  return (
    <ClientPage
      account={account as Prisma.accounting_headGetPayload<Record<string, never>>}
      parents={parents}
      deleteAccount={delete_account}
      linkedUsername={linkedUsername}
    />
  )
}

export default profile('/accounts/[id]/update', Page)
