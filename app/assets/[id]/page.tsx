import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_price } from '@/app/_utils/price_fetcher';
import { Prisma } from '@/generated/prisma/client';
import ClientPage from './ClientPage';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const id = (await params).id;
  const user = await get_current_user();
  if (!user) {
    return (
      <div>
        <h1>Asset</h1>
        <p>Please log in to view this asset.</p>
      </div>
    );
  }

  const asset = await prisma.asset.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { account: true, transaction: true } }, parent: true },
  });

  if (!asset) {
    return (
      <div>
        <h1>Asset</h1>
        <p>Asset not found.</p>
      </div>
    );
  }

  // compute total across real accounts (same logic as assets list)
  let asset_total = new Prisma.Decimal(0);
  const breakdown: {
    account_name: string;
    quantity: number;
    book_value: number | null;
    current_value: number;
    transaction_id: string;
    transaction_date: string;
  }[] = [];

  const real_line_items = asset.line_items.filter(li => li.account.type === 'real');
  for (const li of real_line_items) {
    const qty = li.quantity;
    let current_value = new Prisma.Decimal(0);

    if (asset.type === 'mf') {
      const nav = await get_price_for_asset(asset.type, asset.ticker ?? null);
      if (nav) current_value = new Prisma.Decimal(nav.price).mul(qty);
      else current_value = li.book_value!;
    } else if (asset.type === 'etf' || asset.type === 'shares') {
      const p = await get_price_for_asset(asset.type, asset.ticker ?? null);
      if (p) current_value = new Prisma.Decimal(p.price).mul(qty);
      else current_value = li.book_value!;
    } else if (asset.type === 'rupees') {
      current_value = qty;
    } else {
      current_value = li.book_value!;
    }

    asset_total = asset_total.add(current_value);

    breakdown.push({
      account_name: li.account.name,
      quantity: qty.toNumber(),
      book_value: li.book_value ? li.book_value.toNumber() : null,
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.transaction.date.toISOString(),
    });
  }

  const assetForClient = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ticker: asset.ticker,
    parent: asset.parent ? { id: asset.parent.id, name: asset.parent.name } : null,
    total: asset_total.toNumber(),
    breakdown,
  };

  return <ClientPage asset={assetForClient} currencyLocale="en-IN" currency="INR" />;
}
