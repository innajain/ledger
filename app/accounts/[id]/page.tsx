import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const acc = await prisma.account.findUnique({
    where: { id },
    include: {
      opening_balances: { include: { asset: true, allocation_to_purpose_buckets: { include: { bucket: true } } } },
      income_txn: { include: { asset: true } },
      expense_txn: { include: { asset: true, purpose_bucket: true } },
      self_transfer_or_refundable_or_refund_txn_from: { include: { asset: true, to_account: true } },
      self_transfer_or_refundable_or_refund_txn_to: { include: { asset: true, from_account: true } },
      asset_trade_debit: { include: { credit_asset: true, debit_asset: true, credit_account: true } },
      asset_trade_credit: { include: { debit_asset: true, credit_asset: true, debit_account: true } },
    },
  });

  if (!acc) return <div className="p-6">Account not found</div>;

  // compute current asset balances for this account by aggregating included rows
  const assetMap: Record<string, { id: string; name: string; type?: any; code?: string | null; balance: number }> = {};

  // openings
  acc.opening_balances.forEach(ob => {
    const a = ob.asset;
    if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
    assetMap[a.id].balance += Number(ob.quantity ?? 0);
  });

  // income
  (acc.income_txn || []).forEach(t => {
    if (t.asset) {
      const a = t.asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance += Number(t.quantity ?? 0);
    }
  });

  // expense
  (acc.expense_txn || []).forEach(t => {
    if (t.asset) {
      const a = t.asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance -= Number(t.quantity ?? 0);
    }
  });

  // self transfers: outgoing
  (acc.self_transfer_or_refundable_or_refund_txn_from || []).forEach(t => {
    if (t.asset) {
      const a = t.asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance -= Number(t.quantity ?? 0);
    }
  });

  // self transfers: incoming
  (acc.self_transfer_or_refundable_or_refund_txn_to || []).forEach(t => {
    if (t.asset) {
      const a = t.asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance += Number(t.quantity ?? 0);
    }
  });

  // asset trades: when this account is debit_account, it loses debit_asset
  (acc.asset_trade_debit || []).forEach(t => {
    if (t.debit_asset) {
      const a = t.debit_asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance -= Number(t.debit_quantity ?? 0);
    }
  });

  // asset trades: when this account is credit_account, it gains credit_asset
  (acc.asset_trade_credit || []).forEach(t => {
    if (t.credit_asset) {
      const a = t.credit_asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance += Number(t.credit_quantity ?? 0);
    }
  });

  // fetch prices for assets (best-effort)
  const assetEntries = Object.values(assetMap);
  const pricePromises = assetEntries.map(async a => {
    try {
      const p = await get_price_for_asset(a.type, a.code ?? null);
      return { ...a, price: p?.price ?? null };
    } catch (e) {
      return { ...a, price: null };
    }
  });

  const current_assets = await Promise.all(pricePromises);

  return <ClientPage initial_data={{ ...acc, current_assets }} />;
}
