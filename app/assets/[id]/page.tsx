import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import { ClientPage } from './ClientPage';
import { calc_asset_balance } from '../page';
import { Decimal } from 'decimal.js';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      opening_balances: { include: { account: true } },
      income_txn: { include: { account: true, transaction: true } },
      expense_txn: { include: { account: true, purpose_bucket: true, transaction: true } },
      asset_trade_credit: { include: { credit_account: true, transaction: true, debit_account: true, debit_asset: true } },
      asset_trade_debit: { include: { debit_account: true, transaction: true, credit_account: true, credit_asset: true } },
      self_transfer_or_refundable_or_refund_txn: { include: { from_account: true, to_account: true, transaction: true } },
    },
  });

  if (!asset) return <div className="p-6">Asset not found</div>;

  const price_data = await get_price_for_asset(asset.type, asset.code);
  const balance = calc_asset_balance(asset);

  const account_id_to_balance_map = new Map<string, { name: string; balance: Decimal }>();

  // openings
  asset.opening_balances.forEach(ob => {
    const r = account_id_to_balance_map.get(ob.account_id) || { name: ob.account.name, balance: new Decimal(0) };
    account_id_to_balance_map.set(ob.account_id, { name: r.name, balance: r.balance.plus(ob.quantity) });
  });

  // income
  asset.income_txn.forEach(t => {
    const r = account_id_to_balance_map.get(t.account_id) || { name: t.account.name, balance: new Decimal(0) };
    account_id_to_balance_map.set(t.account_id, { name: r.name, balance: r.balance.plus(t.quantity) });
  });

  // expense
  asset.expense_txn.forEach(t => {
    const r = account_id_to_balance_map.get(t.account_id) || { name: t.account.name, balance: new Decimal(0) };
    account_id_to_balance_map.set(t.account_id, { name: r.name, balance: r.balance.minus(t.quantity) });
  });

  // self transfers
  asset.self_transfer_or_refundable_or_refund_txn.forEach(t => {
    const rFrom = account_id_to_balance_map.get(t.from_account_id) || { name: t.from_account.name, balance: new Decimal(0) };
    const rTo = account_id_to_balance_map.get(t.to_account_id) || { name: t.to_account.name, balance: new Decimal(0) };
    account_id_to_balance_map.set(t.from_account_id, { name: rFrom.name, balance: rFrom.balance.minus(t.quantity) });
    account_id_to_balance_map.set(t.to_account_id, { name: rTo.name, balance: rTo.balance.plus(t.quantity) });
  });

  // asset trades: debit reduces from debit_account, credit adds to credit_account
  asset.asset_trade_debit.forEach((d: any) => {
    const r = account_id_to_balance_map.get(d.debit_account_id) || { name: d.debit_account.name, balance: new Decimal(0) };
    account_id_to_balance_map.set(d.debit_account_id, { name: r.name, balance: r.balance.minus(d.debit_quantity) });
  });
  asset.asset_trade_credit.forEach((c: any) => {
    const r = account_id_to_balance_map.get(c.credit_account_id) || { name: c.credit_account.name, balance: new Decimal(0) };
    account_id_to_balance_map.set(c.credit_account_id, { name: r.name, balance: r.balance.plus(c.credit_quantity) });
  });

  const account_entries = account_id_to_balance_map
    .entries()
    .map(([id, val]) => ({ id, name: val.name, balance: val.balance.toNumber() }))
    .toArray();

  return <ClientPage asset={asset} price_data={price_data} balance={balance} account_entries={account_entries} />;
}
