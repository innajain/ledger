'use server';

import { prisma } from '@/prisma';
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/utils/date';

export async function update_asset_reallocation_between_purpose_buckets({
  id,
  from_purpose_bucket_id,
  to_purpose_bucket_id,
  asset_id,
  quantity,
  date,
}: {
  id: string;
  from_purpose_bucket_id?: string | undefined;
  to_purpose_bucket_id?: string | undefined;
  asset_id?: string | undefined;
  quantity?: number | undefined;
  date?: string | undefined;
}) {
  return await prisma.asset_reallocation_between_purpose_buckets.update({
    where: { id },
    data: {
      from_purpose_bucket_id,
      to_purpose_bucket_id,
      asset_id,
      quantity,
      date: date ? get_date_obj_from_indian_date(date) : get_date_obj_from_indian_date(get_indian_date_from_date_obj(new Date())),
    },
  });
}
