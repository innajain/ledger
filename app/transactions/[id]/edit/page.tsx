import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: {
      income_txn: { include: { allocation_to_purpose_buckets: true } },
      expense_txn: true,
      self_transfer_or_refundable_or_refund_txn: true,
      asset_trade_txn: { include: { asset_replacement_in_purpose_buckets: true } },
    },
  });

  const purpose_buckets = await prisma.purpose_bucket.findMany();
  const assets = await prisma.asset.findMany();
  const accounts = await prisma.account.findMany();

  if (!txn) return <div className="p-6">Transaction not found</div>;

  return <ClientPage initial_data={txn} initial_buckets={purpose_buckets} initial_assets={assets} initial_accounts={accounts} />;
}
