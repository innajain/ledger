import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import type { Prisma } from '@/generated/prisma/client'
import { profile } from '@/lib/metrics/profile'

async function Page() {
  const user = await get_current_user()
  const parents: Prisma.accountGetPayload<Record<string, never>>[] = user
    ? await prisma.account.findMany({
        where: { user_id: user.id, type: 'nominal' },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      })
    : []

  return <ClientPage parents={parents} />
}

export default profile('/income_expenses/create', Page)
