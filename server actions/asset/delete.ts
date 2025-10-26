'use server';

import { prisma } from '@/prisma';

export async function delete_asset(id: string) {
  return prisma.asset.delete({ where: { id } }).catch(err => {
    throw new Error(err.message);
  });
}
