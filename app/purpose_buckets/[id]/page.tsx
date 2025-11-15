import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { calc_asset_balances_in_bucket, calc_asset_values_in_buckets } from '../page';
import { Decimal } from 'decimal.js';
import { Prisma } from '@/generated/prisma';
import { calc_xirr } from '@/utils/xirr';

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

  let xirr: number | null = null;

  if (bucket.name === 'Investments') {
    const cashflows: { amount: number; date: Date }[] = [];
    (
      bucket_with_asset_balances_values.asset_replacement_in_purpose_buckets as Prisma.asset_replacement_in_purpose_bucketGetPayload<{
        include: { asset_trade_txn: { include: { debit_asset: true; credit_asset: true; transaction: true } } };
      }>[]
    ).forEach(replacement => {
      if (replacement.asset_trade_txn.credit_asset.name === 'Money') {
        cashflows.push({ amount: replacement.credit_quantity, date: replacement.asset_trade_txn.transaction.date });
      } else if (replacement.asset_trade_txn.debit_asset.name === 'Money') {
        cashflows.push({ amount: -replacement.debit_quantity, date: replacement.asset_trade_txn.transaction.date });
      }
    });
    const total_monetary_value = bucket_with_asset_balances_values.asset_balances
      .reduce((sum, ab) => sum.plus(ab.monetary_value ?? 0), new Decimal(0))
      .minus(bucket_with_asset_balances_values.asset_balances.find(ab => ab.name === 'Money')?.monetary_value ?? 0);

    cashflows.push({ amount: total_monetary_value.toNumber(), date: new Date() });
    xirr = calc_xirr(cashflows);
  }
  return <ClientPage bucket_with_asset_balances_values={passable_data as any} xirr={xirr} />;
}
