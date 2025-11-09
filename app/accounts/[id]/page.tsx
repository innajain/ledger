import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { ClientPage } from './ClientPage';
import { Decimal } from 'decimal.js';
import { asset } from '@/generated/prisma';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      opening_balances: { include: { asset: true } },
      income_txn: { include: { asset: true, transaction: true } },
      expense_txn: { include: { asset: true, purpose_bucket: true, transaction: true } },
      self_transfer_or_refundable_or_refund_txn_from: { include: { asset: true, to_account: true, transaction: true } },
      self_transfer_or_refundable_or_refund_txn_to: { include: { asset: true, from_account: true, transaction: true } },
      asset_trade_debit: { include: { credit_asset: true, debit_asset: true, credit_account: true, transaction: true } },
      asset_trade_credit: { include: { debit_asset: true, credit_asset: true, debit_account: true, transaction: true } },
    },
  });

  if (!account) return <div className="p-6">Account not found</div>;

  const asset_id_to_balance_map = new Map<string, asset & { balance: Decimal }>();
  account.opening_balances.forEach(async ob => {
    const r = asset_id_to_balance_map.get(ob.asset_id) || { ...ob.asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(ob.asset_id, { ...r, balance: r.balance.plus(ob.quantity) });
  });
  account.income_txn.forEach(t => {
    const r = asset_id_to_balance_map.get(t.asset_id) || { ...t.asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(t.asset_id, { ...r, balance: r.balance.plus(t.quantity) });
  });
  account.expense_txn.forEach(t => {
    const r = asset_id_to_balance_map.get(t.asset_id) || { ...t.asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(t.asset_id, { ...r, balance: r.balance.minus(t.quantity) });
  });
  account.self_transfer_or_refundable_or_refund_txn_from.forEach(t => {
    const r = asset_id_to_balance_map.get(t.asset_id) || { ...t.asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(t.asset_id, { ...r, balance: r.balance.minus(t.quantity) });
  });
  account.self_transfer_or_refundable_or_refund_txn_to.forEach(t => {
    const r = asset_id_to_balance_map.get(t.asset_id) || { ...t.asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(t.asset_id, { ...r, balance: r.balance.plus(t.quantity) });
  });
  account.asset_trade_debit.forEach(d => {
    const r = asset_id_to_balance_map.get(d.debit_asset_id) || { ...d.debit_asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(d.debit_asset_id, { ...r, balance: r.balance.minus(d.debit_quantity) });
  });
  account.asset_trade_credit.forEach(c => {
    const r = asset_id_to_balance_map.get(c.credit_asset_id) || { ...c.credit_asset, balance: new Decimal(0) };
    asset_id_to_balance_map.set(c.credit_asset_id, { ...r, balance: r.balance.plus(c.credit_quantity) });
  });

  const prices = new Map(
    await Promise.all(
      asset_id_to_balance_map.values().map(async a => {
        const price_data = await get_price_for_asset(a.type, a.code);
        return [a.id, price_data ? price_data.price : null] as [string, number | null];
      })
    )
  );

  const assets_with_balance_price_value = asset_id_to_balance_map
    .values()
    .map(asset => {
      const price = prices.get(asset.id) as number | null;
      const monetary_value = price ? asset.balance.mul(price) : null;
      return { ...asset, balance: asset.balance.toNumber(), price, monetary_value: monetary_value ? monetary_value : null };
    })
    .toArray();

  const total_monetary_value = assets_with_balance_price_value.reduce((acc, asset) => acc.plus(asset.monetary_value || 0), new Decimal(0)).toNumber();

  return (
    <ClientPage
      account={{
        ...account,
        total_monetary_value,
        assets_with_balance_price_value: assets_with_balance_price_value.map(a => ({
          ...a,
          monetary_value: a.monetary_value ? a.monetary_value.toNumber() : null,
        })),
      }}
    />
  );
}
