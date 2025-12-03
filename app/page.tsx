import ClientPage from './ClientPage';
import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_price } from '@/app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';
import { flush_redis } from '@/app/_actions/flush';
import { log_out } from '@/app/_actions/auth';

export default async function Home() {
  const user = await get_current_user();
  if (!user) {
    return <ClientPage allocations={[]} />;
  }

  const allocations = await prisma.account.findMany({
    where: { user_id: user.id, type: 'allocation' },
    include: { line_items: { include: { asset: true } } },
  });

  const allocationsForClient: { id: string; name: string; total: number }[] = [];

  for (const acc of allocations) {
    let acc_total = new Prisma.Decimal(0);
    for (const li of acc.line_items) {
      const qty = li.quantity;
      const asset = li.asset;
      let current_value = new Prisma.Decimal(0);

      if (asset.type === 'mf') {
        const nav = await get_price_for_asset(asset.type, asset.ticker ?? null);
        if (nav) current_value = new Prisma.Decimal(nav.price).mul(qty);
        else current_value = li.book_value!;
      } else if (asset.type === 'etf') {
        const p = await get_price_for_asset(asset.type, asset.ticker ?? null);
        if (p) current_value = new Prisma.Decimal(p.price).mul(qty);
        else current_value = li.book_value!;
      } else if (asset.type === 'shares') {
        const p = await get_latest_etf_price(asset.ticker ?? '');
        if (p) current_value = new Prisma.Decimal(p.close).mul(qty);
        else current_value = li.book_value!;
      } else if (asset.type === asset_type.rupees) {
        current_value = qty;
      } else {
        current_value = li.book_value!;
      }

      acc_total = acc_total.add(current_value);
    }

    allocationsForClient.push({ id: acc.id, name: acc.name, total: acc_total.toNumber() });
  }

  return <ClientPage allocations={allocationsForClient} currencyLocale="en-IN" currency="INR" flushRedis={flush_redis} logOut={log_out} />;
}
