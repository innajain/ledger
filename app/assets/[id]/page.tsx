import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { get_price_for_asset, get_latest_etf_or_shares_price } from '@/app/_utils/price_fetcher';
import { asset_type, Prisma } from '@/generated/prisma/client';
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

  // compute total across real accounts and aggregate holdings by account
  let asset_total = new Prisma.Decimal(0);
  const breakdown: {
    account_id: string;
    account_name: string;
    quantity: number;
    book_value: number | null;
    current_value: number;
  }[] = [];

  const real_line_items = asset.line_items.filter(li => li.account.type === 'real');

  // attempt to fetch a price once for the asset (used for all line items)
  const priceResp = await get_price_for_asset(asset.type, asset.ticker ?? null);
  const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null;

  // aggregate per-account
  const map: Record<string, { account_id: string; account_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal }> = {};
  for (const li of real_line_items) {
    const qty = li.quantity;
    // if book_value is missing, treat book as equal to quantity
    const book = li.book_value ?? qty;
    const aid = li.account.id;
    if (!map[aid]) {
      map[aid] = { account_id: aid, account_name: li.account.name, total_qty: new Prisma.Decimal(0), total_book: new Prisma.Decimal(0) };
    }
    map[aid].total_qty = map[aid].total_qty.add(qty);
    map[aid].total_book = map[aid].total_book.add(book);
  }

  for (const k of Object.keys(map)) {
    const entry = map[k];
    
    let current_value = new Prisma.Decimal(0);
    if (asset.type === asset_type.rupees) {
      current_value = entry.total_qty;
    } else if (priceDecimal) {
      current_value = priceDecimal.mul(entry.total_qty);
    } else {
      current_value = entry.total_book;
    }
    
    // Skip if current_value is zero
    if (current_value.equals(0)) continue;

    asset_total = asset_total.add(current_value);

    breakdown.push({
      account_id: entry.account_id,
      account_name: entry.account_name,
      quantity: entry.total_qty.toNumber(),
      book_value: entry.total_book.toNumber(),
      current_value: current_value.toNumber(),
    });
  }

  // prepare per-line items for client (keep transaction-level detail)
  const line_items = real_line_items.map(li => {
    let current_value = new Prisma.Decimal(0);
    if (asset.type === asset_type.rupees) {
      current_value = li.quantity;
    } else if (priceDecimal) {
      current_value = priceDecimal.mul(li.quantity);
    } else {
      // fallback to book value, which itself should be treated as qty when null
      current_value = li.book_value ?? li.quantity;
    }

    return {
      id: li.id,
      account_id: li.account.id,
      account_name: li.account.name,
      quantity: li.quantity.toNumber(),
      // fallback to quantity when book_value is null
      book_value: li.book_value ? li.book_value.toNumber() : li.quantity.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date:  li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
    };
  });

  const assetForClient = {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    ticker: asset.ticker,
    parent: asset.parent ? { id: asset.parent.id, name: asset.parent.name } : null,
    total: asset_total.toNumber(),
    breakdown,
    line_items,
  };

  return <ClientPage asset={assetForClient} currencyLocale="en-IN" currency="INR" />;
}
