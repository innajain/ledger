import ClientPage from './ClientPage';
import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { delete_asset } from '@/app/_actions/resources';
import type { Prisma } from '@/generated/prisma/client';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const user = await get_current_user();
  if (!user) {
    return (
      <div>
        <h1>Update Asset</h1>
        <p>User not authenticated.</p>
      </div>
    );
  }
  const asset = await prisma.asset.findUnique({ where: { id, user_id: user.id } });
  if (!asset) {
    return (
      <div>
        <h1>Update Asset</h1>
        <p>Asset not found.</p>
      </div>
    );
  }

  const parents: Prisma.assetGetPayload<Record<string, never>>[] = user ? await prisma.asset.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } }) : [];

  return <ClientPage asset={asset as Prisma.assetGetPayload<Record<string, never>>} parents={parents} deleteAsset={delete_asset} />;
}
