'use server';

import { prisma } from '@/lib/prisma';
import { get_current_user } from '@/app/_actions/auth';
import { asset_type, Prisma } from '@/generated/prisma/client';
import { CreateLineItemInput } from './transactions';

export async function update_transaction(
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined
) {
  if (!id || id.length === 0) throw new Error('id is required');
  if (line_items.length === 0) throw new Error('line_items are required');
  if (line_items.some(li => new Prisma.Decimal(li.quantity).equals(0))) throw new Error('quantity cannot be zero in any line item');
  if (description && description.length === 0) description = null;
  line_items.forEach(li => {
    if (li.description !== undefined && li.description !== null && li.description.length === 0) {
      li.description = null;
    }
  });

  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  await prisma.$transaction(async prisma => {
    // ensure transaction exists and belongs to user
    const existing = await prisma.transaction.findUnique({ where: { id, user_id: user.id } });
    if (!existing) throw new Error('transaction not found');

    const account_ids = Array.from(new Set(line_items.map(li => li.account_id)));
    const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)));

    const accounts = await prisma.account.findMany({ where: { id: { in: account_ids }, user_id: user.id } });
    if (accounts.length !== account_ids.length) throw new Error('one or more accounts not found');

    const assets = await prisma.asset.findMany({ where: { id: { in: asset_ids }, user_id: user.id } });
    if (assets.length !== asset_ids.length) throw new Error('one or more assets not found');

    const account_by_id = new Map(accounts.map(a => [a.id, a]));
    const asset_by_id = new Map(assets.map(a => [a.id, a]));

    for (const li of line_items) {
      if (!(asset_by_id.get(li.asset_id)!.type === asset_type.rupees)) {
        if (li.book_value == null) throw new Error('book_value is required for non-rupees type assets');
      } else {
        if (li.book_value != null) {
          throw new Error('book_value must be null for rupees type assets');
        }
      }
    }

    // Invariant checks
    // 1) For each asset: sum(quantity) in real accounts == sum(quantity) in allocation accounts == sum(quantity) in nominal accounts
    const qty_by_asset_real = new Map<string, Prisma.Decimal>();
    const qty_by_asset_alloc = new Map<string, Prisma.Decimal>();
    const qty_by_asset_nominal = new Map<string, Prisma.Decimal>();

    // 2) sums of val (book_value ?? quantity) by account type
    let sum_value_real = new Prisma.Decimal(0);
    let sum_value_alloc = new Prisma.Decimal(0);
    let sum_value_nominal = new Prisma.Decimal(0);

    for (const li of line_items) {
      const acc_type = account_by_id.get(li.account_id)!.type;

      const qty = new Prisma.Decimal(li.quantity);
      const val = new Prisma.Decimal(li.book_value ?? li.quantity);

      if (acc_type === 'real') {
        const prev = qty_by_asset_real.get(li.asset_id) ?? new Prisma.Decimal(0);
        qty_by_asset_real.set(li.asset_id, prev.add(qty));
      } else if (acc_type === 'allocation') {
        const prev = qty_by_asset_alloc.get(li.asset_id) ?? new Prisma.Decimal(0);
        qty_by_asset_alloc.set(li.asset_id, prev.add(qty));
      } else {
        const prev = qty_by_asset_nominal.get(li.asset_id) ?? new Prisma.Decimal(0);
        qty_by_asset_nominal.set(li.asset_id, prev.add(qty));
      }

      if (acc_type === 'real') sum_value_real = sum_value_real.add(val);
      else if (acc_type === 'allocation') sum_value_alloc = sum_value_alloc.add(val);
      else if (acc_type === 'nominal') sum_value_nominal = sum_value_nominal.add(val);
    }

    // Check invariant 1: per-asset quantities equal between real and allocation and nominal
    for (const asset_id of asset_ids) {
      const real_qty = qty_by_asset_real.get(asset_id) ?? new Prisma.Decimal(0);
      const alloc_qty = qty_by_asset_alloc.get(asset_id) ?? new Prisma.Decimal(0);
      const nominal_qty = qty_by_asset_nominal.get(asset_id) ?? new Prisma.Decimal(0);
      if (!real_qty.equals(alloc_qty) || !real_qty.equals(nominal_qty)) {
        throw new Error(
          `quantity mismatch for asset ${
            asset_by_id.get(asset_id)!.name
          }: real=${real_qty.toString()} allocation=${alloc_qty.toString()} nominal=${nominal_qty.toString()}`
        );
      }
    }

    // Check invariant 2: sum(value) in real == nominal == allocation
    if (!sum_value_real.equals(sum_value_nominal) || !sum_value_real.equals(sum_value_alloc)) {
      throw new Error('invariant failed: sum(book_value) in real, nominal, and allocation must be equal');
    }

    // Replace line items: delete existing then add new ones, and update transaction
    await prisma.line_item.deleteMany({ where: { transaction_id: id } });

    await prisma.transaction.update({
      where: { id, user_id: user.id },
      data: {
        datetime,
        description,
        line_items: {
          create: line_items.map(li => ({
            quantity: new Prisma.Decimal(li.quantity),
            book_value: li.book_value == null ? null : new Prisma.Decimal(li.book_value),
            account_id: li.account_id,
            asset_id: li.asset_id,
            description: li.description !== undefined && li.description !== null && li.description.length === 0 ? null : li.description,
            datetime: li.datetime,
          })),
        },
      },
    });
  });
}
