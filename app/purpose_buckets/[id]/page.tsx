import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { Decimal } from 'decimal.js';
import ClientPage from './ClientPage';
import { calc_asset_balances_in_bucket, calc_asset_values_in_buckets } from '../page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const bucket = await prisma.purpose_bucket.findUnique({
    where: { id },
    include: {
      allocation_to_purpose_buckets: {
        include: {
          allocation_thru_account_opening: { include: { asset: true, account: true } },
          allocation_thru_income: { include: { asset: true, transaction: true } },
        },
      },
      expense_txn: { include: { account: true, asset: true, transaction: true } },
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true, to_purpose_bucket: true } },
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true, from_purpose_bucket: true } },
      asset_replacement_in_purpose_buckets: {
        include: { asset_trade_txn: { include: { debit_asset: true, credit_asset: true, transaction: true } } },
      },
    },
  });

  if (!bucket) return <div className="p-6">Purpose bucket not found</div>;

  const balances = calc_asset_balances_in_bucket({ bucket });

  const bucket_with_asset_balances_values = (await calc_asset_values_in_buckets([{ ...bucket, asset_balances: balances }]))[0];
  const passable_data = {
    ...bucket_with_asset_balances_values,
    asset_balances: bucket_with_asset_balances_values.asset_balances.map(ab => ({
      ...ab,
      balance: ab.balance.toNumber(),
    })),
  };
  return <ClientPage bucket_with_asset_balances_values={passable_data as any} />;
}
