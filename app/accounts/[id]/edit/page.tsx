import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acc = await prisma.account.findUnique({ where: { id }, include: { opening_balances: { include: { asset: true, allocation_to_purpose_buckets: true } } } });
  if (!acc) return <div className="p-6">Account not found</div>;

  const assets = await prisma.asset.findMany();
  const purpose_buckets = await prisma.purpose_bucket.findMany();

  return <ClientPage initial_data={acc} initial_assets={assets} initial_buckets={purpose_buckets} />;
}
