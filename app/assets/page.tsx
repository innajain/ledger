import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import ClientPage from './ClientPage';

export default async function Page() {
  const assets = await prisma.asset.findMany({
    include: { opening_balances: true, income_txn: true, expense_txn: true, asset_trade_credit: true, asset_trade_debit: true },
  });

  const assets_with_price = await Promise.all(
    assets.map(async asset => {
      const price_data = await get_price_for_asset(asset.type, asset.code);
      return { ...asset, price: price_data?.price ?? null };
    })
  );

  const assets_with_balance = assets_with_price.map(asset => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    code: asset.code,
    price: asset.price,
    balance:
      asset.opening_balances.reduce((sum, ob) => sum + ob.quantity, 0) +
      asset.income_txn.reduce((sum, txn) => sum + txn.quantity, 0) -
      asset.expense_txn.reduce((sum, txn) => sum + txn.quantity, 0) +
      asset.asset_trade_credit.reduce((sum, txn) => sum + txn.credit_quantity, 0) -
      asset.asset_trade_debit.reduce((sum, txn) => sum + txn.debit_quantity, 0),
  }));

  return <ClientPage initial_data={assets_with_balance} />;
}
