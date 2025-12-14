import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset } from '@/app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';
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
    include: { line_items: { include: { asset: true, transaction: true }, orderBy: { transaction: { datetime: 'desc' } } }, parent: true },
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
    quantity: number;
    book_value: number | null;
    current_value: number;
    transaction_id: string;
    transaction_date: string;
    transaction_description: string | null;
    line_item_description: string | null;
    asset_type: asset_type;
  }[] = [];
  // aggregate holdings by asset and also prepare per-line items
  const real_line_items = account.line_items;

  // fetch price per asset when needed; we'll cache by asset id
  const priceCache: Record<string, Prisma.Decimal | null> = {};

  const map: Record<string, { asset_id: string; asset_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal; type: asset_type }> = {};

  for (const li of real_line_items) {
    const qty = li.quantity;
    const asset = li.asset;

    // determine price for this asset, fetch once
    if (!(asset.id in priceCache)) {
      try {
        if (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares') {
          const p = await get_price_for_asset(asset.type, asset.ticker ?? null);
          priceCache[asset.id] = p ? new Prisma.Decimal(p.price) : null;
        } else {
          priceCache[asset.id] = null;
        }
      } catch {
        priceCache[asset.id] = null;
      }
    }

    const priceDecimal = priceCache[asset.id];

    let current_value = new Prisma.Decimal(0);
    if (asset.type === asset_type.rupees) current_value = qty;
    else if (priceDecimal) current_value = priceDecimal.mul(qty);
    else current_value = li.book_value ?? qty;

    acc_total = acc_total.add(current_value);

    // accumulate per-asset
    if (!map[asset.id]) {
      map[asset.id] = {
        asset_id: asset.id,
        asset_name: asset.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
        type: asset.type,
      };
    }
    map[asset.id].total_qty = map[asset.id].total_qty.add(qty);
    map[asset.id].total_book = map[asset.id].total_book.add(li.book_value ?? qty);

    lineItemsWithValues.push({
      id: li.id,
      asset_id: asset.id,
      asset_name: asset.name,
      quantity: qty.toNumber(),
      book_value: li.book_value ? li.book_value.toNumber() : qty.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
      asset_type: asset.type,
    });
  }

  const breakdown: {
    asset_id: string;
    asset_name: string;
    quantity: number;
    book_value: number | null;
    current_value: number;
    asset_type: asset_type;
  }[] = [];
  for (const k of Object.keys(map)) {
    const e = map[k];
    let current_value = new Prisma.Decimal(0);
    if (e.type === asset_type.rupees) current_value = e.total_qty;
    else if (priceCache[k]) current_value = priceCache[k]!.mul(e.total_qty);
    else current_value = e.total_book;

    breakdown.push({
      asset_id: e.asset_id,
      asset_name: e.asset_name,
      quantity: e.total_qty.toNumber(),
      book_value: e.total_book.toNumber(),
      current_value: current_value.toNumber(),
      asset_type: e.type,
    });
  }

  const accountForClient = {
    id: account.id,
    name: account.name,
    type: account.type,
    parent: account.parent ? { id: account.parent.id, name: account.parent.name } : null,
    total: acc_total.toNumber(),
    breakdown,
    line_items: lineItemsWithValues,
  };

  return <ClientPage account={accountForClient} currencyLocale="en-IN" currency="INR" />;
}
