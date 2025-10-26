import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { get_price_for_asset } from '@/utils/price_fetcher';

export default async function Page() {
  const accounts = await prisma.account.findMany({
    include: {
      opening_balances: { include: { asset: true } },
      income_txn: true,
      expense_txn: true,
      self_transfer_or_refundable_or_refund_txn_from: true,
      self_transfer_or_refundable_or_refund_txn_to: true,
      asset_trade_debit: true,
      asset_trade_credit: true,
    },
  });

  const accounts_summarized = await Promise.all(
    accounts.map(async acc => {
      // build per-asset balance map for this account
      const asset_to_balance = new Map<string, number>();

      // opening balances
      acc.opening_balances.forEach(ob => {
        asset_to_balance.set(ob.asset_id, (asset_to_balance.get(ob.asset_id) || 0) + ob.quantity);
      });

      // incomes credited to this account
      acc.income_txn.forEach(txn => {
        asset_to_balance.set(txn.asset_id, (asset_to_balance.get(txn.asset_id) || 0) + txn.quantity);
      });

      // expenses debited from this account
      acc.expense_txn.forEach(txn => {
        asset_to_balance.set(txn.asset_id, (asset_to_balance.get(txn.asset_id) || 0) - txn.quantity);
      });

      // asset trades where this account is debit (asset out)
      acc.asset_trade_debit.forEach(txn => {
        asset_to_balance.set(txn.debit_asset_id, (asset_to_balance.get(txn.debit_asset_id) || 0) - txn.debit_quantity);
      });

      // asset trades where this account is credit (asset in)
      acc.asset_trade_credit.forEach(txn => {
        asset_to_balance.set(txn.credit_asset_id, (asset_to_balance.get(txn.credit_asset_id) || 0) + txn.credit_quantity);
      });

      // For assets involved, fetch their prices
      const assetIds = Array.from(new Set([...acc.opening_balances.map(ob => ob.asset_id), ...acc.income_txn.map(t => t.asset_id), ...acc.expense_txn.map(t => t.asset_id), ...acc.asset_trade_debit.map(t => t.debit_asset_id), ...acc.asset_trade_credit.map(t => t.credit_asset_id)]));

      // fetch asset records for types and codes
      const assets = await prisma.asset.findMany({ where: { id: { in: assetIds } } });

      const assetIdToPrice = new Map<string, number | null>();
      await Promise.all(
        assets.map(async a => {
          const priceData = await get_price_for_asset(a.type, a.code);
          assetIdToPrice.set(a.id, priceData?.price ?? null);
        })
      );

      const total_monetary_value = Array.from(asset_to_balance.entries()).reduce((sum, [asset_id, balance]) => {
        const price = assetIdToPrice.get(asset_id) || 0;
        return sum + (price ? balance * price : 0);
      }, 0);

      return {
        id: acc.id,
        name: acc.name,
        opening_balances: acc.opening_balances.map(ob => ({ id: ob.id, asset_id: ob.asset_id, asset_name: ob.asset?.name ?? '', quantity: ob.quantity })),
        total_monetary_value,
      };
    })
  );

  const overall_total = accounts_summarized.reduce((s, a) => s + (a.total_monetary_value ?? 0), 0);

  return <ClientPage initial_data={accounts_summarized} overall_total={overall_total} />;
}
