import ClientPage from './ClientPage'
import { prisma } from '@/lib/prisma'
import { get_current_user, is_current_user_admin } from '@/app/_actions/auth'
import { delete_asset } from '@/app/_actions/resources'
import type { Prisma } from '@/generated/prisma/client'
import { profile } from '@/lib/metrics/profile'
import { NotFound } from '@/app/_components/NotFound'

async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Edit asset</h1>
        <p>User not authenticated.</p>
      </div>
    )
  }
  // Admin check, the asset row and the parent picker list are independent — one round trip.
  // ParentAssetSelect only reads id/name, so the list stays slim.
  const [isAdmin, asset, parents] = await Promise.all([
    is_current_user_admin(),
    prisma.asset.findUnique({ where: { id } }),
    prisma.asset.findMany({
      select: { id: true, name: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
  ])
  if (!isAdmin) {
    return (
      <div>
        <h1>Edit asset</h1>
        <p>Assets are managed by admins only.</p>
      </div>
    )
  }
  if (!asset) {
    return <NotFound title="Asset not found" backHref="/assets" backLabel="Back to assets" />
  }

  return <ClientPage asset={asset as Prisma.assetGetPayload<Record<string, never>>} parents={parents} deleteAsset={delete_asset} />
}

export default profile('/assets/[id]/update', Page)
