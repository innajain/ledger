import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { toDecimal } from '@/utils/decimal';

export default async function Page() {
  const buckets = await prisma.purpose_bucket.findMany({
    include: {
      allocation_to_purpose_bucket: { include: { allocation_thru_income: true, allocation_thru_account_opening: true } },
      asset_replacement_in_purpose_buckets: { include: { asset_trade_txn: true } },
      asset_reallocation_between_purpose_buckets_from: true,
      asset_reallocation_between_purpose_buckets_to: true,
      expense_txn: true,
    },
  });

  const summarized = await Promise.all(
    buckets.map(async b => {
      const asset_to_balance = new Map<string, number>();

      // allocations (from income txn or opening balance)
      b.allocation_to_purpose_bucket.forEach(a => {
        if (a.allocation_thru_income) {
          const assetId = a.allocation_thru_income.asset_id;
          asset_to_balance.set(assetId, (asset_to_balance.get(assetId) || 0) + a.quantity);
        } else if (a.allocation_thru_account_opening) {
          const assetId = a.allocation_thru_account_opening.asset_id;
          asset_to_balance.set(assetId, (asset_to_balance.get(assetId) || 0) + a.quantity);
        }
      });

      // replacements (asset replacements recorded against this bucket)
      b.asset_replacement_in_purpose_buckets.forEach(r => {
        const txn = r.asset_trade_txn;
        if (txn) {
          // subtract debit asset, add credit asset
          asset_to_balance.set(txn.debit_asset_id, (asset_to_balance.get(txn.debit_asset_id) || 0) - (r.debit_quantity || 0));
          asset_to_balance.set(txn.credit_asset_id, (asset_to_balance.get(txn.credit_asset_id) || 0) + (r.credit_quantity || 0));
        }
      });

      // reallocations: subtract from 'from' entries, add for 'to' entries
      b.asset_reallocation_between_purpose_buckets_from.forEach(r => {
        asset_to_balance.set(r.asset_id, (asset_to_balance.get(r.asset_id) || 0) - r.quantity);
      });
      b.asset_reallocation_between_purpose_buckets_to.forEach(r => {
        asset_to_balance.set(r.asset_id, (asset_to_balance.get(r.asset_id) || 0) + r.quantity);
      });

      b.expense_txn.forEach(r => {
        asset_to_balance.set(r.asset_id, (asset_to_balance.get(r.asset_id) || 0) - r.quantity);
      });

      const assetIds = Array.from(new Set(Array.from(asset_to_balance.keys()).filter(Boolean)));

      const assets = assetIds.length ? await prisma.asset.findMany({ where: { id: { in: assetIds } } }) : [];

      const assetIdToPrice = new Map<string, number | null>();
      await Promise.all(
        assets.map(async a => {
          const priceData = await get_price_for_asset(a.type, a.code);
          assetIdToPrice.set(a.id, priceData?.price ?? null);
        })
      );

      const total_monetary_value = Array.from(asset_to_balance.entries()).reduce((s, [asset_id, balance]) => {
        const price = assetIdToPrice.get(asset_id) || 0;
        return s.plus(price ? toDecimal(balance).times(toDecimal(price)) : toDecimal(0));
      }, toDecimal(0)).toNumber();

      return { id: b.id, name: b.name, total_monetary_value };
    })
  );

  return <ClientPage initial_data={summarized} />;
}
