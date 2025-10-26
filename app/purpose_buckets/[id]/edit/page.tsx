import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bucket = await prisma.purpose_bucket.findUnique({ where: { id } });
  if (!bucket) return <div className="p-6">Purpose bucket not found</div>;

  return <ClientPage initial_data={bucket} />;
}
