import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { ClientPage } from './ClientPage';
import { Prisma } from '@/generated/prisma';
import { Decimal } from 'decimal.js';

export default async function Page() {
  const assets = await prisma.asset.findMany({
    include: { opening_balances: true, income_txn: true, expense_txn: true, asset_trade_credit: true, asset_trade_debit: true },
  });

  const asset_to_price_map = new Map<string, number | null>(
    await Promise.all(
      assets.map(async asset => {
        const priceData = await get_price_for_asset(asset.type, asset.code);
        return [asset.id, priceData?.price ?? null] as [string, number | null];
      })
    )
  );

  const asset_to_balance_map = new Map(assets.map(asset => [asset.id, calc_asset_balance(asset)]));

  const assets_with_price_balance_value = assets.map(asset => ({
    ...asset,
    price: asset_to_price_map.get(asset.id) ?? null,
    balance: asset_to_balance_map.get(asset.id)!,
    monetary_value: asset_to_price_map.get(asset.id)
      ? new Decimal(asset_to_balance_map.get(asset.id)!).times(asset_to_price_map.get(asset.id) || 0).toNumber()
      : null,
  }));

  return <ClientPage assets={assets_with_price_balance_value} />;
}

export function calc_asset_balance(
  asset: Prisma.assetGetPayload<{
    include: { opening_balances: true; income_txn: true; expense_txn: true; asset_trade_credit: true; asset_trade_debit: true };
  }>
) {
  const opening = asset.opening_balances.reduce((s, ob) => s.plus(ob.quantity), new Decimal(0));
  const income = asset.income_txn.reduce((s, txn) => s.plus(txn.quantity), new Decimal(0));
  const expense = asset.expense_txn.reduce((s, txn) => s.plus(txn.quantity), new Decimal(0));
  const credit = asset.asset_trade_credit.reduce((s, txn) => s.plus(txn.credit_quantity), new Decimal(0));
  const debit = asset.asset_trade_debit.reduce((s, txn) => s.plus(txn.debit_quantity), new Decimal(0));
  return opening.plus(income).minus(expense).plus(credit).minus(debit).toNumber();
}
