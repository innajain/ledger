'use server';

import { prisma } from '@/prisma';

export async function delete_asset_reallocation_between_purpose_buckets(id: string) {
  return await prisma.asset_reallocation_between_purpose_buckets.delete({ where: { id } });
}
