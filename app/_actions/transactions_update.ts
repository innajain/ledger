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
): Promise<{ success: boolean; message: string }> {
  try {
    if (!id || id.length === 0) throw new Error('Transaction ID is required');
    if (line_items.length === 0) throw new Error('At least one line item is required');
    if (line_items.some(li => new Prisma.Decimal(li.quantity).equals(0))) throw new Error('Quantity cannot be zero in any line item');
    if (description) description = description.trim();
    if (description === '') description = null;
    line_items.forEach(li => {
      if (li.description) li.description = li.description.trim();
      if (li.description === '') li.description = null;
    });

    const user = await get_current_user();
    if (!user) throw new Error('You must be logged in to update transactions');

    await prisma.$transaction(async prisma => {
      // ensure transaction exists and belongs to user
      const existing = await prisma.transaction.findUnique({ where: { id, user_id: user.id } });
      if (!existing) throw new Error('Transaction not found or does not belong to your user');

      const account_ids = Array.from(new Set(line_items.map(li => li.account_id)));
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)));

      const accounts = await prisma.account.findMany({ where: { id: { in: account_ids }, user_id: user.id } });
      if (accounts.length !== account_ids.length) throw new Error('One or more accounts not found or do not belong to your user');

      const assets = await prisma.asset.findMany({ where: { id: { in: asset_ids }, user_id: user.id } });
      if (assets.length !== asset_ids.length) throw new Error('One or more assets not found or do not belong to your user');

      const account_by_id = new Map(accounts.map(a => [a.id, a]));
      const asset_by_id = new Map(assets.map(a => [a.id, a]));

      for (const li of line_items) {
        const asset = asset_by_id.get(li.asset_id)!;
        // For non-rupees assets (stocks, ETFs, etc.), book_value is required
        if (asset.type !== asset_type.rupees) {
          if (li.book_value == null) throw new Error(`Book value is required for non-currency asset "${asset.name}"`);
        } else {
          // For rupees, book_value must be null (quantity is the value)
          if (li.book_value != null) {
            throw new Error(`Book value must not be specified for currency asset "${asset.name}" (quantity is the value)`);
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
        const asset = asset_by_id.get(asset_id)!;
        throw new Error(
          `Transaction is not balanced for asset "${asset.name}": Real accounts total ${real_qty.toString()}, Allocation accounts total ${alloc_qty.toString()}, Nominal accounts total ${nominal_qty.toString()}. All three must be equal.`
        );
      }
    }

    // Check invariant 2: sum(value) in real == nominal == allocation
    if (!sum_value_real.equals(sum_value_nominal) || !sum_value_real.equals(sum_value_alloc)) {
      throw new Error(`Transaction is not balanced by value: Real accounts total ${sum_value_real.toString()}, Allocation accounts total ${sum_value_alloc.toString()}, Nominal accounts total ${sum_value_nominal.toString()}. All three must be equal.`);
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

  return {
    success: true,
    message: 'Transaction updated successfully',
  };
  } catch (error) {
    console.error('Error updating transaction:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update transaction',
    };
  }
}
