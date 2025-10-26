import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const acc = await prisma.account.findUnique({
    where: { id },
    include: {
      opening_balances: { include: { asset: true, allocation_to_purpose_buckets: { include: { bucket: true } } } },
      income_txn: { include: { asset: true } },
      expense_txn: { include: { asset: true, purpose_bucket: true } },
      self_transfer_or_refundable_or_refund_txn_from: { include: { asset: true, to_account: true } },
      self_transfer_or_refundable_or_refund_txn_to: { include: { asset: true, from_account: true } },
      asset_trade_debit: { include: { credit_asset: true, debit_asset: true, credit_account: true } },
      asset_trade_credit: { include: { debit_asset: true, credit_asset: true, debit_account: true } },
    },
  });

  if (!acc) return <div className="p-6">Account not found</div>;

  return <ClientPage initial_data={acc} />;
}
