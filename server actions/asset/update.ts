'use server';

import { asset_type } from '@/generated/prisma';
import { prisma } from '@/prisma';

export async function update_asset(
  id: string,
  { name, type, code }: { name?: string | undefined; type?: asset_type | undefined; code?: string | undefined | null }
) {
  return prisma.asset.update({ where: { id }, data: { name, type, code } }).catch(err => {
    throw new Error((err.message));
  });
}
