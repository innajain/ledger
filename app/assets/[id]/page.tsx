import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      opening_balances: { include: { account: true, allocation_to_purpose_buckets: { include: { bucket: true } } } },
      income_txn: { include: { account: true, allocation_to_purpose_buckets: { include: { bucket: true } } } },
      expense_txn: { include: { account: true, purpose_bucket: true } },
      asset_trade_credit: { include: { credit_account: true } },
      asset_trade_debit: { include: { debit_account: true } },
    },
  });

  if (!asset) return <div className="p-6">Asset not found</div>;

  const price_data = await get_price_for_asset(asset.type, asset.code);

  return <ClientPage initial_data={{ ...asset, price: price_data?.price ?? null }} />;
}
