import { prisma } from '@/prisma';
import { get_price_for_asset } from '@/utils/price_fetcher';
import ClientPage from './ClientPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const bucket = await prisma.purpose_bucket.findUnique({
    where: { id },
    include: {
      allocation_to_purpose_bucket: { include: { allocation_thru_income: { include: { account: true, asset: true } }, allocation_thru_account_opening: { include: { account: true, asset: true } } } },
      expense_txn: { include: { account: true, asset: true } },
      asset_replacement_in_purpose_buckets: {
        include: {
          asset_trade_txn: {
            include: { debit_asset: true, credit_asset: true, debit_account: true, credit_account: true },
          },
        },
      },
      asset_reallocation_between_purpose_buckets_from: { include: { asset: true, to_purpose_bucket: true } },
      asset_reallocation_between_purpose_buckets_to: { include: { asset: true, from_purpose_bucket: true } },
    },
  });

  if (!bucket) return <div className="p-6">Purpose bucket not found</div>;

  // compute current asset balances for this bucket
  const assetMap: Record<string, { id: string; name: string; type?: any; code?: string | null; balance: number }> = {};

  // allocations into this bucket
  (bucket.allocation_to_purpose_bucket || []).forEach(a => {
    const srcIncome = (a as any).allocation_thru_income;
    const srcOpening = (a as any).allocation_thru_account_opening;
    const asset = srcIncome?.asset || srcOpening?.asset;
    if (!asset) return;
    if (!assetMap[asset.id]) assetMap[asset.id] = { id: asset.id, name: asset.name, type: (asset as any).type, code: (asset as any).code ?? null, balance: 0 };
    assetMap[asset.id].balance += Number(a.quantity ?? 0);
  });

  // reallocations moved into this bucket
  (bucket.asset_reallocation_between_purpose_buckets_to || []).forEach(r => {
    const asset = (r as any).asset;
    if (!asset) return;
    if (!assetMap[asset.id]) assetMap[asset.id] = { id: asset.id, name: asset.name, type: (asset as any).type, code: (asset as any).code ?? null, balance: 0 };
    assetMap[asset.id].balance += Number((r as any).quantity ?? 0);
  });

  // reallocations moved out of this bucket
  (bucket.asset_reallocation_between_purpose_buckets_from || []).forEach(r => {
    const asset = (r as any).asset;
    if (!asset) return;
    if (!assetMap[asset.id]) assetMap[asset.id] = { id: asset.id, name: asset.name, type: (asset as any).type, code: (asset as any).code ?? null, balance: 0 };
    assetMap[asset.id].balance -= Number((r as any).quantity ?? 0);
  });

  // replacements: treat as debit (removed) and credit (added)
  (bucket.asset_replacement_in_purpose_buckets || []).forEach(r => {
    const txn = (r as any).asset_trade_txn;
    const debitQty = Number((r as any).debit_quantity ?? 0);
    const creditQty = Number((r as any).credit_quantity ?? 0);
    if (txn?.debit_asset) {
      const a = txn.debit_asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance -= debitQty;
    }
    if (txn?.credit_asset) {
      const a = txn.credit_asset;
      if (!assetMap[a.id]) assetMap[a.id] = { id: a.id, name: a.name, type: (a as any).type, code: (a as any).code ?? null, balance: 0 };
      assetMap[a.id].balance += creditQty;
    }
  });

  // expenses reduce balances for assets in this bucket
  (bucket.expense_txn || []).forEach(e => {
    const asset = (e as any).asset;
    if (!asset) return;
    if (!assetMap[asset.id]) assetMap[asset.id] = { id: asset.id, name: asset.name, type: (asset as any).type, code: (asset as any).code ?? null, balance: 0 };
    assetMap[asset.id].balance -= Number(e.quantity ?? 0);
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

  return <ClientPage initial_data={{ ...bucket, current_assets }} />;
}
