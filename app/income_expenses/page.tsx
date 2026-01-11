import ClientPage from './ClientPage';
import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset } from '@/app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';
import type { Metadata } from 'next';

// Route segment config for performance
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Income & Expenses',
  description: 'View and manage your income and expense accounts',
};

export default async function Page() {
  const user = await get_current_user();
  if (!user) {
    return (
      <div>
        <h1>Income / Expense</h1>
        <p>Please log in to view nominal accounts.</p>
      </div>
    );
  }

  // fetch nominal accounts with line_items and asset details
  const accounts = await prisma.account.findMany({
    where: { user_id: user.id, type: 'nominal' },
    include: { line_items: { include: { asset: true } }, parent: true },
  });

  // Collect unique assets that need price fetching
  const uniqueAssets = new Map<string, { type: asset_type; ticker: string | null }>();
  for (const acc of accounts) {
    for (const li of acc.line_items) {
      const asset = li.asset;
      if (asset.ticker && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
        const key = `${asset.type}:${asset.ticker}`;
        if (!uniqueAssets.has(key)) {
          uniqueAssets.set(key, { type: asset.type, ticker: asset.ticker });
        }
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

  const totalsByAccount: Record<string, number> = {};
  let grand_total = new Prisma.Decimal(0);

  for (const acc of accounts) {
    let acc_total = new Prisma.Decimal(0);
    for (const li of acc.line_items) {
      const qty = li.quantity;
      const asset = li.asset;

      let current_value = new Prisma.Decimal(0);

      if (asset.type === asset_type.rupees) {
        current_value = qty;
      } else if (asset.ticker && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
        const key = `${asset.type}:${asset.ticker}`;
        const priceData = priceCache.get(key);
        if (priceData) {
          current_value = new Prisma.Decimal(priceData.price).mul(qty);
        } else {
          current_value = li.book_value!;
        }
      } else {
        current_value = li.book_value!;
      }

      acc_total = acc_total.add(current_value);
    }
    totalsByAccount[acc.id] = acc_total.toNumber();
    grand_total = grand_total.add(acc_total);
  }

  return (
    <ClientPage
      accounts={accounts.map(x => ({
        ...x,
        line_items: x.line_items.map(li => ({
          ...li,
          quantity: li.quantity.toNumber(),
          book_value: li.book_value ? li.book_value.toNumber() : null,
        })),
      }))}
      totals={totalsByAccount}
      grand_total={grand_total.toNumber()}
    />
  );
}
