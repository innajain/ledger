import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const txn = await prisma.transaction.findUnique({
    where: { id },
    include: {
      income_txn: { include: { allocation_to_purpose_buckets: { include: { bucket: true } }, account: true, } },
      expense_txn: { include: { account: true, purpose_bucket: true } },
      self_transfer_or_refundable_or_refund_txn: { include: { from_account: true, to_account: true, asset: true } },
      asset_trade_txn: { include: { asset_replacement_in_purpose_buckets: { include: { purpose_bucket: true } }, debit_account: true, credit_account: true, } },
    },
  });

  if (!txn) return <div className="p-6">Transaction not found</div>;

  return <ClientPage initial_data={txn} />;
}
