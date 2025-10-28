'use server';

import { prisma } from '@/prisma';
import { get_date_obj_from_indian_date } from '@/utils/date';
import { toDecimal } from '@/utils/decimal';

export async function update_account(
  id: string,
  {
    name,
    opening_balance_creates,
    opening_balance_updates,
    opening_balance_deletes,
  }: {
    name?: string | undefined;
    opening_balance_creates:
      | { asset_id: string; quantity: number; date: string; allocation_to_purpose_buckets: { purpose_bucket_id: string; quantity: number }[] }[];
    opening_balance_updates:
      | {
          id: string;
          asset_id?: string | undefined;
          quantity?: number | undefined;
          date?: string | undefined;
          allocation_to_purpose_buckets_creates: { purpose_bucket_id: string; quantity: number }[];
          allocation_to_purpose_buckets_deletes: { id: string }[];
          allocation_to_purpose_buckets_updates: { id: string; purpose_bucket_id?: string | undefined; quantity?: number | undefined }[];
        }[];
    opening_balance_deletes: { asset_id: string }[];
  }
) {
  opening_balance_creates.forEach(ob => {
    const allocSum = ob.allocation_to_purpose_buckets.reduce((s, apb) => s.plus(toDecimal(apb.quantity)), toDecimal(0));
    if (!allocSum.equals(toDecimal(ob.quantity))) throw new Error(`Opening balance quantity for asset ${ob.asset_id} does not match the sum of allocations to purpose buckets`);
  });

  await prisma
    .$transaction(async tx => {
      const acc = await tx.account.update({
        where: { id },
        data: {
          name,
          opening_balances: {
            deleteMany: { asset_id: { in: opening_balance_deletes.map(d => d.asset_id) } },
            createMany: {
              data: opening_balance_creates.map(ob => ({ asset_id: ob.asset_id, quantity: ob.quantity, date: get_date_obj_from_indian_date(ob.date) })),
            },
            updateMany: opening_balance_updates.map(ob => ({
              where: { id: ob.id },
              data: { asset_id: ob.asset_id, quantity: ob.quantity, date: ob.date ? get_date_obj_from_indian_date(ob.date) : undefined },
            })),
          },
        },
        include: { opening_balances: true },
      });

      await Promise.all(
        opening_balance_creates.map(ob =>
          tx.opening_balance.update({
            where: { account_id_asset_id: { account_id: acc.id, asset_id: ob.asset_id } },
            data: { allocation_to_purpose_buckets: { createMany: { data: ob.allocation_to_purpose_buckets } } },
          })
        )
      );

      await Promise.all(
        opening_balance_updates.map(async ob => {
          const opening_balance = await tx.opening_balance.update({
            where: { id: ob.id },
            data: {
              allocation_to_purpose_buckets: {
                createMany: { data: ob.allocation_to_purpose_buckets_creates },
                deleteMany: { id: { in: ob.allocation_to_purpose_buckets_deletes.map(d => d.id) } },
                updateMany: ob.allocation_to_purpose_buckets_updates.map(apb => ({
                  where: { id: apb.id },
                  data: { quantity: apb.quantity, purpose_bucket_id: apb.purpose_bucket_id },
                })),
              },
            },
            include: { allocation_to_purpose_buckets: true },
          });

          if (!toDecimal(opening_balance.quantity).equals(opening_balance.allocation_to_purpose_buckets.reduce((s, apb) => s.plus(toDecimal(apb.quantity)), toDecimal(0))))
            throw new Error(`Opening balance quantity for asset ${ob.asset_id} does not match the sum of allocations to purpose buckets`);
        })
      );
    })
    .catch(err => {
      throw new Error(err.message);
    });
}
