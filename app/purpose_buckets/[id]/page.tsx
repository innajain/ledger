import { prisma } from '@/prisma';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const bucket = await prisma.purpose_bucket.findUnique({
    where: { id },
    include: {
      allocation_to_purpose_bucket: { include: { allocation_thru_income: { include: { account: true, asset: true } }, allocation_thru_account_opening: { include: { account: true, asset: true } } } },
      expense_txn: { include: { account: true, asset: true } },
      asset_replacement_in_purpose_buckets: {
        include: {
          asset_trade_txn: {
            include: { debit_asset: true, credit_asset: true, debit_account: true, credit_account: true },
          },
        },
      },
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true, to_purpose_bucket: true } },
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true, from_purpose_bucket: true } },
    },
  });

  if (!bucket) return <div className="p-6">Purpose bucket not found</div>;

  return <ClientPage initial_data={bucket} />;
}
