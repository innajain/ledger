import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { toDecimal } from '@/utils/decimal';
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
    balance: (() => {
      const opening = asset.opening_balances.reduce((s, ob) => s.plus(toDecimal(ob.quantity)), toDecimal(0));
      const income = asset.income_txn.reduce((s, txn) => s.plus(toDecimal(txn.quantity)), toDecimal(0));
      const expense = asset.expense_txn.reduce((s, txn) => s.plus(toDecimal(txn.quantity)), toDecimal(0));
      const credit = asset.asset_trade_credit.reduce((s, txn) => s.plus(toDecimal(txn.credit_quantity)), toDecimal(0));
      const debit = asset.asset_trade_debit.reduce((s, txn) => s.plus(toDecimal(txn.debit_quantity)), toDecimal(0));
      return opening.plus(income).minus(expense).plus(credit).minus(debit).toNumber();
    })(),
  }));

  return <ClientPage initial_data={assets_with_balance} />;
}
