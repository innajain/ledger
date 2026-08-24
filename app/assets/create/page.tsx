import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { is_current_user_admin } from '@/app/_actions/auth'
import { profile } from '@/lib/metrics/profile'

async function Page() {
  if (!(await is_current_user_admin())) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">New asset</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Assets are managed by admins only.</p>
      </div>
    )
  }

  // ParentAssetSelect only reads id/name — don't ship every column of every asset.
  const parents = await prisma.asset.findMany({
    select: { id: true, name: true },
    orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  })

  return <ClientPage parents={parents} />
}

export default profile('/assets/create', Page)
