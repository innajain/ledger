import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acc = await prisma.account.findUnique({ where: { id }, include: { opening_balances: { include: { asset: true, allocation_to_purpose_buckets: true } } } });
  if (!acc) return <div className="p-6">Account not found</div>;

  return <ClientPage initial_data={acc} />;
}
