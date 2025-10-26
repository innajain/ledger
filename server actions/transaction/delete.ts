'use server';

import { prisma } from '@/prisma';

export async function delete_transaction(id: string) {
  return prisma.transaction.delete({ where: { id } }).catch(err => {
    throw new Error(err.message);
  });
}
