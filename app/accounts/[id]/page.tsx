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
        <h1>Account</h1>
        <p>Please log in to view this account.</p>
      </div>
    );
  }

  const account = await prisma.account.findUnique({
    where: { id, user_id: user.id },
    include: { line_items: { include: { asset: true, transaction: true } }, parent: true },
  });

  if (!account) {
    return (
      <div>
        <h1>Account</h1>
        <p>Account not found.</p>
      </div>
    );
  }

  let acc_total = new Prisma.Decimal(0);
  const lineItemsWithValues: {
    id: string;
    asset_id: string;
    asset_name: string;
    is_base_currency: boolean;
    quantity: number;
    book_value: number | null;
    current_value: number;
    transaction_id: string;
    transaction_date: string;
  }[] = [];

  for (const li of account.line_items) {
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

    acc_total = acc_total.add(current_value);

    lineItemsWithValues.push({
      id: li.id,
      asset_id: asset.id,
      asset_name: asset.name,
      is_base_currency: !!asset.is_base_currency,
      quantity: qty.toNumber(),
      book_value: li.book_value ? li.book_value.toNumber() : null,
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.transaction.date.toISOString(),
    });
  }

  const currencyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  const accountForClient = {
    id: account.id,
    name: account.name,
    type: account.type,
    parent: account.parent ? { id: account.parent.id, name: account.parent.name } : null,
    total: acc_total.toNumber(),
    line_items: lineItemsWithValues,
  };

  return <ClientPage account={accountForClient} currencyLocale="en-IN" currency="INR" />;
}
