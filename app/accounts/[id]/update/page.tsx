import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { delete_account } from '@/app/_actions/resources'
import type { Prisma } from '@/generated/prisma/client'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
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
  const account = await prisma.account.findUnique({
    where: { id, user_id: user.id, type: 'real' },
  })
  if (!account) {
    return (
      <div>
        <h1>Update Account</h1>
        <p>Account not found.</p>
      </div>
    )
  }

  const parents: Prisma.accountGetPayload<Record<string, never>>[] = user
    ? await prisma.account.findMany({
        where: { user_id: user.id, type: 'real' },
        orderBy: { name: 'asc' },
      })
    : []

  return <ClientPage account={account as Prisma.accountGetPayload<Record<string, never>>} parents={parents} deleteAccount={delete_account} />
}
