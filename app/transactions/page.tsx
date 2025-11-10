import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page() {
  const txns = await prisma.transaction.findMany({
    orderBy: { date: 'desc' },
    include: {
      income_txn: { include: { account: true, asset: true } },
      expense_txn: { include: { account: true, purpose_bucket: true, asset: true } },
      self_transfer_or_refundable_or_refund_txn: { include: { from_account: true, to_account: true, asset: true } },
      asset_trade_txn: { include: { credit_account: true, credit_asset: true, debit_account: true, debit_asset: true } },
    },
  });

  return <ClientPage transactions={txns} />;
}
