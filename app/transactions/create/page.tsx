import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page() {
  const assets = await prisma.asset.findMany();
  const accounts = await prisma.account.findMany();
  const purpose_buckets = await prisma.purpose_bucket.findMany();

  return <ClientPage assets={assets} accounts={accounts} purpose_buckets={purpose_buckets} />;
}
