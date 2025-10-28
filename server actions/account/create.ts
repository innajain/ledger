'use server';

import { prisma } from '@/prisma';
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/utils/date';
import { toDecimal } from '@/utils/decimal';

export async function create_account({
  name,
  opening_balances,
}: {
  name: string;
  opening_balances: {
    asset_id: string;
    quantity: number;
    date?: string | undefined;
    allocation_to_purpose_buckets: { purpose_bucket_id: string; quantity: number }[];
  }[];
}) {
  opening_balances.forEach(ob => {
    const allocSum = ob.allocation_to_purpose_buckets.reduce((s, apb) => s.plus(toDecimal(apb.quantity)), toDecimal(0));
    if (!allocSum.equals(toDecimal(ob.quantity))) {
      throw new Error(`Opening balance quantity for asset ${ob.asset_id} does not match the sum of allocations to purpose buckets`);
    }
  });
  return prisma
    .$transaction(async tx => {
      const acc = await tx.account.create({
        data: {
          name,
          opening_balances: {
            createMany: {
              data: opening_balances.map(ob => ({
                asset_id: ob.asset_id,
                quantity: ob.quantity,
                date: get_date_obj_from_indian_date(ob.date || get_indian_date_from_date_obj(new Date())),
              })),
            },
          },
        },
      });

      await Promise.all(
        opening_balances.map(ob =>
          tx.opening_balance.update({
            where: { account_id_asset_id: { account_id: acc.id, asset_id: ob.asset_id } },
            data: { allocation_to_purpose_buckets: { createMany: { data: ob.allocation_to_purpose_buckets } } },
          })
        )
      );
      // return the created account so callers can navigate to it
      return acc;
    }, {timeout: 100000})
    .catch(err => {
      throw new Error(err.message);
    });
}
