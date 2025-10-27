import ClientPage from './ClientPage';
import { prisma } from '@/prisma';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const realloc = await prisma.asset_reallocation_between_purpose_buckets.findUnique({
    where: { id },
    include: { asset: true, from_purpose_bucket: true, to_purpose_bucket: true },
  });

  const purpose_buckets = await prisma.purpose_bucket.findMany();
  const assets = await prisma.asset.findMany();

  if (!realloc) return <div className="p-6">Reallocation not found</div>;

  return <ClientPage initial_data={realloc} purpose_buckets={purpose_buckets} assets={assets} />;
}
