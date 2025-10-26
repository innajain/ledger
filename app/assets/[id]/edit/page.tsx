import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { update_asset } from '@/server actions/asset/update';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return <div className="p-6">Asset not found</div>;

  return <ClientPage initial_data={asset} />;
}
