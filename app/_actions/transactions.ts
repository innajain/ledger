'use server';

import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { asset_type, Prisma } from '@/generated/prisma/client';

type CreateLineItemInput = {
  account_id: string;
  asset_id: string;
  quantity: number;
  book_value?: number | null | undefined;
  description?: string | null | undefined;
};

export async function create_transaction(date: Date, line_items: CreateLineItemInput[], description?: string | null | undefined) {
  if (line_items.length === 0) throw new Error('line_items are required');
  if (line_items.some(li => li.quantity === 0)) throw new Error('quantity cannot be zero in any line item');
  if (description && description.length === 0) description = null;

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.$transaction(async prisma => {
    const account_ids = Array.from(new Set(line_items.map(li => li.account_id)));
    const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)));

    const accounts = await prisma.account.findMany({ where: { id: { in: account_ids }, user_id: user.id } });
    if (accounts.length !== account_ids.length) throw new Error('one or more accounts not found');

    const assets = await prisma.asset.findMany({ where: { id: { in: asset_ids }, user_id: user.id } });
    if (assets.length !== asset_ids.length) throw new Error('one or more assets not found');

    // Build maps for account types
    const account_by_id = new Map(accounts.map(a => [a.id, a]));
    const asset_by_id = new Map(assets.map(a => [a.id, a]));

    for (const li of line_items) {
      if (!(asset_by_id.get(li.asset_id)!.type === asset_type.rupees)) {
        if (li.book_value == null) throw new Error('book_value is required for rupees type assets');
      } else {
        if (li.book_value != null) {
          throw new Error('book_value must be null for rupees type assets');
        }
      }
    }

    // Invariant checks
    // 1) For each asset: sum(quantity) in real accounts == sum(quantity) in allocation accounts
    const qty_by_asset_real = new Map<string, Prisma.Decimal>();
    const qty_by_asset_alloc = new Map<string, Prisma.Decimal>();

    // 2 & 3) sums of book_value by account type
    let sum_book_value_real = new Prisma.Decimal(0);
    let sum_book_value_alloc = new Prisma.Decimal(0);
    let sum_book_value_nominal = new Prisma.Decimal(0);

    // Validate and accumulate
    for (const li of line_items) {
      const acc_type = account_by_id.get(li.account_id)!.type;

      // convert quantity and book_value
      const qty = new Prisma.Decimal(li.quantity);
      const book_val = new Prisma.Decimal(li.book_value ?? li.quantity);

      // accumulate quantity by asset & account type
      if (acc_type === 'real') {
        const prev = qty_by_asset_real.get(li.asset_id) ?? new Prisma.Decimal(0);
        qty_by_asset_real.set(li.asset_id, prev.add(qty));
      } else if (acc_type === 'allocation') {
        const prev = qty_by_asset_alloc.get(li.asset_id) ?? new Prisma.Decimal(0);
        qty_by_asset_alloc.set(li.asset_id, prev.add(qty));
      }

      // accumulate book values by account type
      if (acc_type === 'real') sum_book_value_real = sum_book_value_real.add(book_val);
      else if (acc_type === 'allocation') sum_book_value_alloc = sum_book_value_alloc.add(book_val);
      else if (acc_type === 'nominal') sum_book_value_nominal = sum_book_value_nominal.add(book_val);
    }

    // Check invariant 1: per-asset quantities equal between real and allocation
    for (const asset_id of asset_ids) {
      const real_qty = qty_by_asset_real.get(asset_id)!;
      const alloc_qty = qty_by_asset_alloc.get(asset_id)!;
      if (!real_qty.equals(alloc_qty)) {
        throw new Error(
          `quantity mismatch for asset ${asset_by_id.get(asset_id)!.name}: real=${real_qty.toString()} allocation=${alloc_qty.toString()}`
        );
      }
    }

    // Check invariant 2: sum(book_value) in real + nominal == 0
    if (!sum_book_value_real.add(sum_book_value_nominal).equals(new Prisma.Decimal(0))) {
      throw new Error('invariant failed: sum(book_value) in real + nominal must equal 0');
    }

    // Check invariant 3: sum(book_value) in allocation + nominal == 0
    if (!sum_book_value_alloc.add(sum_book_value_nominal).equals(new Prisma.Decimal(0))) {
      throw new Error('invariant failed: sum(book_value) in allocation + nominal must equal 0');
    }

    // All checks passed — create the transaction with nested line_items
    await prisma.transaction.create({
      data: {
        date,
        description,
        user_id: user.id,
        line_items: {
          create: line_items.map(li => ({
            quantity: new Prisma.Decimal(li.quantity),
            book_value: li.book_value == null ? null : new Prisma.Decimal(li.book_value),
            account_id: li.account_id,
            asset_id: li.asset_id,
            description: li.description !== undefined && li.description !== null && li.description.length === 0 ? null : li.description,
          })),
        },
      },
    });
  });
}

export async function delete_transaction(id: string): Promise<void> {
  if (id.length === 0) throw new Error('id is required');

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.transaction.delete({ where: { id, user_id: user.id } });
}
