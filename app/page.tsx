import { prisma } from '@/prisma';
import { calc_asset_balances_in_bucket, calc_asset_values_in_buckets } from './purpose_buckets/page';
import { Decimal } from 'decimal.js';
import { ClientPage } from './ClientPage';

export default async function Home() {
  const buckets = await prisma.purpose_bucket.findMany({
    include: {
      allocation_to_purpose_buckets: {
        include: { allocation_thru_account_opening: { include: { asset: true } }, allocation_thru_income: { include: { asset: true } } },
      },
      expense_txn: { include: { account: true, asset: true } },
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true, to_purpose_bucket: true } },
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true, from_purpose_bucket: true } },
      asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: { include: { debit_asset: true, credit_asset: true } } } },
    },  
  });
  const purpose_buckets_with_asset_balances = await Promise.all(
    buckets.map(async bucket => {
      const asset_balances = calc_asset_balances_in_bucket({ bucket });
      return { ...bucket, asset_balances };
    })
  );
  const purpose_buckets_with_asset_balances_values = await calc_asset_values_in_buckets(purpose_buckets_with_asset_balances);

  const bucket_with_values = purpose_buckets_with_asset_balances_values.map(pb => {
    const monetary_value = pb.asset_balances.reduce((s, a) => s.plus(a.monetary_value || 0), new Decimal(0)).toNumber();
    return { ...pb, monetary_value };
  });

  const total_monetary_value = bucket_with_values.reduce((s, bucket) => s.plus(bucket.monetary_value || 0), new Decimal(0));

  const bucket_to_value_map = new Map(bucket_with_values.map(b => [b.id, b.monetary_value]));
  const investment_purpose_bucket = buckets.find(b => b.name === 'Investments');
  const total_investment_value = investment_purpose_bucket ? bucket_to_value_map.get(investment_purpose_bucket.id)! : 0;

  const emergencyBuckets = buckets.filter(b => b.name.toLowerCase().includes('emergency'));
  const total_emergency_value = emergencyBuckets.map(bucket => bucket_to_value_map.get(bucket.id)!).reduce((s, v) => s.plus(v), new Decimal(0));

  const expendable_monetary_value = total_monetary_value.minus(total_investment_value).minus(total_emergency_value).minus(50000);
  return (
    <ClientPage
      expendable_monetary_value={expendable_monetary_value.toNumber()}
      total_investment_monetary_value={total_investment_value}
      total_emergency_monetary_value={total_emergency_value.toNumber()}
    />
  );
}
