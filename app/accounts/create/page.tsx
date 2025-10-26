import ClientPage from './ClientPage';
import { prisma } from '@/prisma';

export default async function Page() {
  const assets = await prisma.asset.findMany();
  const purpose_buckets = await prisma.purpose_bucket.findMany();

  return <ClientPage assets={assets} purpose_buckets={purpose_buckets} />;
}
