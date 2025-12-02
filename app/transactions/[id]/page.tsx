import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_price } from '@/app/_utils/price_fetcher';
import ClientPage from './ClientPage';
import { Prisma } from '@/generated/prisma/client';
import { delete_transaction } from '@/app/_actions/transactions';

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const id = (await params).id;
  const user = await get_current_user();
  if (!user) return <div>Please log in.</div>;

  const tx = await prisma.transaction.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, account: true } } },
  });
  if (!tx) return <div>Transaction not found.</div>;

  let total = new Prisma.Decimal(0);
  const items = [] as any[];
  for (const li of tx.line_items) {
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
    } else if (asset.type === 'rupees') {
      current_value = qty;
    } else {
      current_value = li.book_value!;
    }

    total = total.add(current_value);
    items.push({
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      account_type: li.account.type,
      asset_id: asset.id,
      asset_name: asset.name,
      is_base_currency: asset.is_base_currency ?? false,
      quantity: qty.toNumber(),
      book_value: li.book_value ? li.book_value.toNumber() : null,
      current_value: current_value.toNumber(),
    });
  }

  const txForClient = {
    id: tx.id,
    date: tx.date.toISOString(),
    description: tx.description,
    total: total.toNumber(),
    line_items: items,
  };

  return <ClientPage transaction={txForClient} deleteTransaction={delete_transaction} />;
}
