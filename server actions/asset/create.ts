'use server';

import { asset_type } from '@/generated/prisma';
import { prisma } from '@/prisma';

export async function create_asset({ name, type, code }: { name: string; type: asset_type; code?: string | undefined | null }) {
  return prisma.asset.create({ data: { name, type, code } }).catch(err => {
    throw new Error(err.message);
  });
}
