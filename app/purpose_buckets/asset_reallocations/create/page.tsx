import ClientPage from './ClientPage';
import { prisma } from '@/prisma';

export default async function Page() {
  const purpose_buckets = await prisma.purpose_bucket.findMany();
  const assets = await prisma.asset.findMany();

  return <ClientPage purpose_buckets={purpose_buckets} assets={assets} />;
}
