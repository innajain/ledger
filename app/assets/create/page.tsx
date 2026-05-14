import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import type { Prisma } from '@/generated/prisma/client'

export default async function Page() {
  const user = await get_current_user()
  const parents: Prisma.assetGetPayload<Record<string, never>>[] = user
    ? await prisma.asset.findMany({
        where: { user_id: user.id },
        orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
      })
    : []

  return <ClientPage parents={parents} />
}
