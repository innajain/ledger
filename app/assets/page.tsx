import ClientPage from './ClientPage';
import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_price } from '@/app/_utils/price_fetcher';
import { Prisma } from '@/generated/prisma/client';

export default async function Page() {
  const user = await get_current_user();
  if (!user) {
    return (
      <div>
        <h1>Assets</h1>
        <p>Please log in to view assets.</p>
      </div>
    );
  }

  // fetch assets with their line_items
  const assets = await prisma.asset.findMany({
    where: { user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } }, parent: true },
  });

  const totalsByAsset: Record<string, number> = {};
  let grand_total = new Prisma.Decimal(0);

  for (const asset of assets) {
    let asset_total = new Prisma.Decimal(0);
    const real_line_items = asset.line_items.filter(li => li.account.type === 'real');
    // Sum across all line items for this asset
    for (const li of real_line_items) {
      const qty = li.quantity;
      let current_value: Prisma.Decimal;

      if (asset.type === 'mf') {
        const nav = await get_price_for_asset(asset.type, asset.ticker!);
        if (nav) {
          current_value = new Prisma.Decimal(nav.price).mul(qty);
        } else {
          current_value = li.book_value!;
        }
      } else if (asset.type === 'etf' || asset.type === 'shares') {
        const p = await get_price_for_asset(asset.type, asset.ticker!);
        if (p) current_value = new Prisma.Decimal(p.price).mul(qty);
        else current_value = li.book_value!;
      } else if (asset.type === 'rupees') {
        current_value = qty;
      } else {
        // other -> use book_value as current value
        current_value = li.book_value!;
      }

      asset_total = asset_total.add(current_value);
    }

    totalsByAsset[asset.id] = asset_total.toNumber();
    grand_total = grand_total.add(asset_total);
  }

  return (
    <ClientPage
      assets={assets.map(x => ({
        ...x,
        line_items: x.line_items.map(li => ({
          ...li,
          quantity: li.quantity.toNumber(),
          book_value: li.book_value ? li.book_value.toNumber() : null,
        })),
      }))}
      totals={totalsByAsset}
      grand_total={grand_total.toNumber()}
    />
  );
}
