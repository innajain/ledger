import { prisma } from '@/lib/prisma';
import Link from 'next/link';
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
        <h1>Allocation</h1>
        <p>Please log in to view this allocation.</p>
      </div>
    );
  }

  const allocation = await prisma.account.findUnique({
    where: { id, user_id: user.id, type: 'allocation' },
    include: { line_items: { include: { asset: true, transaction: true } }, parent: true },
  });

  if (!allocation) {
    return (
      <div>
        <h1>Allocation</h1>
        <p>Allocation not found.</p>
      </div>
    );
  }

  let acc_total = new Prisma.Decimal(0);
  const lineItemsWithValues: {
    id: string;
    asset_id?: string;
    asset_name: string;
    is_base_currency: boolean;
    quantity: number;
    book_value: number | null;
    current_value: number;
    transaction_id: string;
    transaction_date: string;
  }[] = [];

  for (const li of allocation.line_items) {
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
      is_base_currency: !!asset.is_base_currency || asset.type === 'rupees',
      quantity: qty.toNumber(),
      book_value: li.book_value ? li.book_value.toNumber() : null,
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.transaction.date.toISOString(),
    });
  }

  const currencyFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

  const allocationForClient = {
    id: allocation.id,
    name: allocation.name,
    type: allocation.type,
    parent: allocation.parent ? { id: allocation.parent.id, name: allocation.parent.name } : null,
    total: acc_total.toNumber(),
    line_items: lineItemsWithValues,
  };

  return <ClientPage allocation={allocationForClient} currencyLocale="en-IN" currency="INR" />;
}
