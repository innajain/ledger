import ClientPage from './ClientPage';
import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_or_shares_price } from '@/app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';
import type { Metadata } from 'next';

// Route segment config for performance
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Assets',
  description: 'View and manage all your financial assets',
};

export default async function Page({ searchParams }: { searchParams: Promise<{ showInactive?: string }> }) {
  const params = await searchParams;
  const showInactive = params.showInactive === 'true';
  
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
    where: { 
      user_id: user.id,
      ...(showInactive ? {} : { is_active: true })
    },
    include: { line_items: { include: { asset: true, account: true } }, parent: true },
  });

  // Collect unique assets that need price fetching
  const uniqueAssets = new Map<string, { type: asset_type; ticker: string | null }>();
  for (const asset of assets) {
    if (asset.ticker && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
      const key = `${asset.type}:${asset.ticker}`;
      if (!uniqueAssets.has(key)) {
        uniqueAssets.set(key, { type: asset.type, ticker: asset.ticker });
      }
    }
  }

  // Fetch all prices in parallel
  const pricePromises = Array.from(uniqueAssets.entries()).map(async ([key, { type, ticker }]) => {
    const price = await get_price_for_asset(type, ticker);
    return { key, price };
  });

  const priceResults = await Promise.all(pricePromises);
  const priceCache = new Map<string, { price: number; date: Date }>();
  for (const { key, price } of priceResults) {
    if (price) priceCache.set(key, price);
  }

  const totalsByAsset: Record<string, number> = {};
  let grand_total = new Prisma.Decimal(0);

  for (const asset of assets) {
    let asset_total = new Prisma.Decimal(0);
    const real_line_items = asset.line_items.filter(li => li.account.type === 'real');
    
    // Get price once per asset
    let assetPrice: { price: number; date: Date } | null = null;
    if (asset.ticker && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
      const key = `${asset.type}:${asset.ticker}`;
      assetPrice = priceCache.get(key) || null;
    }

    // Sum across all line items for this asset
    for (const li of real_line_items) {
      const qty = li.quantity;
      let current_value: Prisma.Decimal;

      if (asset.type === asset_type.rupees) {
        current_value = qty;
      } else if (assetPrice) {
        current_value = new Prisma.Decimal(assetPrice.price).mul(qty);
      } else {
        // Fallback to book_value
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
      showInactive={showInactive}
    />
  );
}
