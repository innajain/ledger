'use server';

import { prisma } from '@/prisma';

export async function update_purpose_bucket({ id, name }: { id: string; name?: string | undefined }) {
  return prisma.purpose_bucket.update({ where: { id }, data: { name } }).catch(err => {
    throw new Error(err.message);
  });
}
