import { prisma } from '@/prisma';
import ClientPage from './ClientPage';
import { get_price_for_asset } from '@/utils/price_fetcher';

export default async function Page() {
  const txns = await prisma.transaction.findMany({
    orderBy: { id: 'desc' },
    include: { income_txn: true, expense_txn: true, self_transfer_or_refundable_or_refund_txn: true, asset_trade_txn: true },
    take: 50,
  });

  // collect asset and account ids we'll need
  const assetIds = new Set<string>();
  const accountIds = new Set<string>();

  txns.forEach(t => {
    if (t.income_txn) {
      assetIds.add(t.income_txn.asset_id);
      accountIds.add(t.income_txn.account_id);
    }
    if (t.expense_txn) {
      assetIds.add(t.expense_txn.asset_id);
      accountIds.add(t.expense_txn.account_id);
    }
    if (t.self_transfer_or_refundable_or_refund_txn) {
      assetIds.add(t.self_transfer_or_refundable_or_refund_txn.asset_id);
      accountIds.add(t.self_transfer_or_refundable_or_refund_txn.from_account_id);
      accountIds.add(t.self_transfer_or_refundable_or_refund_txn.to_account_id);
    }
    if (t.asset_trade_txn) {
      assetIds.add(t.asset_trade_txn.debit_asset_id);
      assetIds.add(t.asset_trade_txn.credit_asset_id);
      accountIds.add(t.asset_trade_txn.debit_account_id);
      accountIds.add(t.asset_trade_txn.credit_account_id);
    }
  });

  const assets = assetIds.size ? await prisma.asset.findMany({ where: { id: { in: Array.from(assetIds) } } }) : [];
  const accounts = accountIds.size ? await prisma.account.findMany({ where: { id: { in: Array.from(accountIds) } } }) : [];

  const assetById = new Map(assets.map(a => [a.id, a]));
  const accountById = new Map(accounts.map(a => [a.id, a]));

  // fetch prices for assets
  const assetIdToPrice = new Map<string, number | null>();
  await Promise.all(
    assets.map(async a => {
      const priceData = await get_price_for_asset(a.type, a.code);
      assetIdToPrice.set(a.id, priceData?.price ?? null);
    })
  );

  const summarized = txns.map(t => {
    let asset_name: string | null = null;
    let account_name: string | null = null;
    let quantity: number | null = null;
    let value: number | null = null;

    if (t.income_txn) {
      const it = t.income_txn;
      asset_name = assetById.get(it.asset_id)?.name ?? null;
      account_name = accountById.get(it.account_id)?.name ?? null;
      quantity = it.quantity;
      const price = assetIdToPrice.get(it.asset_id) ?? 0;
      value = price ? price * it.quantity : 0;
    } else if (t.expense_txn) {
      const et = t.expense_txn;
      asset_name = assetById.get(et.asset_id)?.name ?? null;
      account_name = accountById.get(et.account_id)?.name ?? null;
      quantity = et.quantity;
      const price = assetIdToPrice.get(et.asset_id) ?? 0;
      value = price ? price * et.quantity : 0;
    } else if (t.self_transfer_or_refundable_or_refund_txn) {
      const st = t.self_transfer_or_refundable_or_refund_txn;
      asset_name = assetById.get(st.asset_id)?.name ?? null;
      const from = accountById.get(st.from_account_id)?.name ?? null;
      const to = accountById.get(st.to_account_id)?.name ?? null;
      account_name = from && to ? `${from} → ${to}` : from ?? to ?? null;
      quantity = st.quantity;
      const price = assetIdToPrice.get(st.asset_id) ?? 0;
      value = price ? price * st.quantity : 0;
    } else if (t.asset_trade_txn) {
      const at = t.asset_trade_txn;
      // show debit side as representative
      asset_name = assetById.get(at.debit_asset_id)?.name ?? null;
      account_name = accountById.get(at.debit_account_id)?.name ?? null;
      quantity = at.debit_quantity;
      const price = assetIdToPrice.get(at.debit_asset_id) ?? 0;
      value = price ? price * at.debit_quantity : 0;
    }

    // pick a date from the concrete txn where available
    let date: string | null = null;
    if (t.income_txn) date = t.income_txn.date.toISOString();
    else if (t.expense_txn) date = t.expense_txn.date.toISOString();
    else if (t.self_transfer_or_refundable_or_refund_txn) date = t.self_transfer_or_refundable_or_refund_txn.date.toISOString();
    else if (t.asset_trade_txn) date = t.asset_trade_txn.debit_date.toISOString();

    return {
      id: t.id,
      type: t.type,
      description: t.description || '',
      asset_name,
      account_name,
      quantity,
      value,
      date,
    };
  });

  return <ClientPage initial_data={summarized} />;
}
