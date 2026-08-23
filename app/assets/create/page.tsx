import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import { profile } from '@/lib/metrics/profile'

async function Page() {
  const user = await get_current_user()
  const me = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { is_admin: true } }) : null
  if (!me?.is_admin) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">New asset</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Assets are managed by admins only.</p>
      </div>
    )
  }

  const parents = await prisma.asset.findMany({
    orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  })

  return <ClientPage parents={parents} />
}

export default profile('/assets/create', Page)
