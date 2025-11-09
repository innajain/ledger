import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { Decimal } from 'decimal.js';
import { asset, Prisma } from '@/generated/prisma';

export default async function Page() {
  const accounts = await prisma.account.findMany({
    include: {
      opening_balances: true,
      income_txn: true,
      expense_txn: true,
      self_transfer_or_refundable_or_refund_txn_from: true,
      self_transfer_or_refundable_or_refund_txn_to: true,
      asset_trade_debit: true,
      asset_trade_credit: true,
    },
  });

  const assets = await prisma.asset.findMany();

  const asset_to_asset_with_price_map = new Map(
    await Promise.all(
      assets.map(async asset => {
        const priceData = await get_price_for_asset(asset.type, asset.code);
        return [asset.id, { ...asset, price: priceData?.price ?? null }] as [string, asset & { price: number | null }];
      })
    )
  );

  const accounts_with_value = await Promise.all(
    accounts.map(async acc => {
      const asset_to_balance_map = calc_asset_balances_in_account(acc);
      const assets_with_balance_price_value = asset_to_balance_map
        .entries()
        .map(([asset_id, balance]) => {
          const asset = asset_to_asset_with_price_map.get(asset_id)!;
          return {
            ...asset,
            balance: balance.toNumber(),
            price: asset.price,
            monetary_value: asset.price ? balance.mul(asset.price).toNumber() : null,
          };
        })
        .toArray();
      const total_monetary_value = assets_with_balance_price_value.reduce((s, a) => s.plus(a.monetary_value ?? 0), new Decimal(0)).toNumber();
      return { ...acc, total_monetary_value };
    })
  );

  return <ClientPage accounts={accounts_with_value} />;
}

export function calc_asset_balances_in_account(
  account: Prisma.accountGetPayload<{
    include: {
      opening_balances: true;
      income_txn: true;
      expense_txn: true;
      self_transfer_or_refundable_or_refund_txn_from: true;
      self_transfer_or_refundable_or_refund_txn_to: true;
      asset_trade_debit: true;
      asset_trade_credit: true;
    };
  }>
) {
  const asset_to_balance_map = new Map<string, Decimal>();
  // opening balances
  account.opening_balances.forEach(ob => {
    asset_to_balance_map.set(ob.asset_id, (asset_to_balance_map.get(ob.asset_id) || new Decimal(0)).plus(ob.quantity));
  });

  // incomes credited to this account
  account.income_txn.forEach(txn => {
    asset_to_balance_map.set(txn.asset_id, (asset_to_balance_map.get(txn.asset_id) || new Decimal(0)).plus(txn.quantity));
  });

  // expenses debited from this account
  account.expense_txn.forEach(txn => {
    asset_to_balance_map.set(txn.asset_id, (asset_to_balance_map.get(txn.asset_id) || new Decimal(0)).minus(txn.quantity));
  });

  // asset trades where this account is debit (asset out)
  account.asset_trade_debit.forEach(txn => {
    asset_to_balance_map.set(txn.debit_asset_id, (asset_to_balance_map.get(txn.debit_asset_id) || new Decimal(0)).minus(txn.debit_quantity));
  });

  // asset trades where this account is credit (asset in)
  account.asset_trade_credit.forEach(txn => {
    asset_to_balance_map.set(txn.credit_asset_id, (asset_to_balance_map.get(txn.credit_asset_id) || new Decimal(0)).plus(txn.credit_quantity));
  });

  account.self_transfer_or_refundable_or_refund_txn_from.forEach(txn => {
    asset_to_balance_map.set(txn.asset_id, (asset_to_balance_map.get(txn.asset_id) || new Decimal(0)).minus(txn.quantity));
  });

  account.self_transfer_or_refundable_or_refund_txn_to.forEach(txn => {
    asset_to_balance_map.set(txn.asset_id, (asset_to_balance_map.get(txn.asset_id) || new Decimal(0)).plus(txn.quantity));
  });

  return asset_to_balance_map;
}
