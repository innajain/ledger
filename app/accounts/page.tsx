import ClientPage from './ClientPage';
import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_price } from '@/app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';

export default async function Page() {
  const user = await get_current_user();
  if (!user) {
    return (
      <div>
        <h1>Accounts</h1>
        <p>Please log in to view accounts.</p>
      </div>
    );
  }

  // fetch accounts with line_items and asset details
  const accounts = await prisma.account.findMany({
    where: { user_id: user.id, type: 'real' },
    include: { line_items: { include: { asset: true } }, parent: true },
  });

  const totalsByAccount: Record<string, number> = {};
  let grand_total = new Prisma.Decimal(0);

  for (const acc of accounts) {
    let acc_total = new Prisma.Decimal(0);
    for (const li of acc.line_items) {
      const qty = li.quantity;
      const asset = li.asset;

      let current_value = new Prisma.Decimal(0);

      if (asset.type === 'mf') {
        const nav = await get_price_for_asset(asset.type, asset.ticker ?? null);
        if (nav) {
          current_value = new Prisma.Decimal(nav.price).mul(qty);
        } else {
          current_value = li.book_value!;
        }
      } else if (asset.type === 'etf') {
        const p = await get_price_for_asset(asset.type, asset.ticker ?? null);
        if (p) current_value = new Prisma.Decimal(p.price).mul(qty);
        else current_value = li.book_value!;
      } else if (asset.type === 'shares') {
        // shares use latest market price similar to ETF
        const price_data = await get_latest_etf_price(asset.ticker ?? '');
        if (price_data) current_value = new Prisma.Decimal(price_data.close).mul(qty);
        else current_value = li.book_value!;
      } else if (asset.type === asset_type.rupees) {
        // quantity itself represents value
        current_value = qty;
      } else {
        // other types use book_value as current value
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
          book_value: li.book_value ? li.book_value .toNumber() : null,
        })),
      }))}
      totals={totalsByAccount}
      grand_total={grand_total.toNumber()}
    />
  );
}
