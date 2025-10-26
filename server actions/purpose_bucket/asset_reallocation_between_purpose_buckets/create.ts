import { prisma } from '@/prisma';
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/utils/date';

export async function create_asset_reallocation_between_purpose_buckets({
  from_purpose_bucket_id,
  to_purpose_bucket_id,
  asset_id,
  quantity,
  date,
}: {
  from_purpose_bucket_id: string;
  to_purpose_bucket_id: string;
  asset_id: string;
  quantity: number;
  date?: string;
}) {
  return await prisma.asset_reallocation_between_purpose_buckets.create({
    data: {
      from_purpose_bucket_id,
      to_purpose_bucket_id,
      asset_id,
      quantity,
      date: date ? get_date_obj_from_indian_date(date) : get_date_obj_from_indian_date(get_indian_date_from_date_obj(new Date())),
    },
  });
}
