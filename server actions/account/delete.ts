'use server';

import { prisma } from '@/prisma';

export async function delete_account(id: string) {
  return prisma.account.delete({ where: { id } }).catch(err => {
    throw new Error(err.message);
  });
}
