'use server';

import { prisma } from '@/prisma';

export async function delete_purpose_bucket({ id }: { id: string }) {
  return prisma.purpose_bucket.delete({ where: { id } }).catch(err => {
    throw new Error(err.message);
  });
}
