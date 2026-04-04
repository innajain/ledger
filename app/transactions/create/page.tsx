import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'

export default async function Page() {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Create Transaction</h1>
        <p>Please log in to create transactions.</p>
      </div>
    )
  }

  const accounts = await prisma.account.findMany({
    where: { user_id: user.id },
    orderBy: { name: 'asc' },
  })
  const assets = await prisma.asset.findMany({
    where: { user_id: user.id },
    orderBy: { name: 'asc' },
  })

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

  return <ClientPage accounts={accountsForClient} assets={assetsForClient} />
}
