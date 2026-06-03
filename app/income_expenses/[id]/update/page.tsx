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
        <h1>Update Income / Expense</h1>
        <p>User not authenticated.</p>
      </div>
    )
  }
  const account = await prisma.accounting_head.findUnique({
    where: { id, user_id: user.id },
  })
  if (!account || account.type !== 'income_expense') {
    return (
      <div>
        <h1>Update Income / Expense</h1>
        <p>Account not found.</p>
      </div>
    )
  }

  const parents: Prisma.accounting_headGetPayload<Record<string, never>>[] = user
    ? await prisma.accounting_head.findMany({
        where: { user_id: user.id, type: 'income_expense' },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      })
    : []

  return <ClientPage account={account as Prisma.accounting_headGetPayload<Record<string, never>>} parents={parents} deleteAccount={delete_account} />
}

export default profile('/income_expenses/[id]/update', Page)
