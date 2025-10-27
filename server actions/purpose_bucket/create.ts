'use server';

import { prisma } from '@/prisma';

export async function create_purpose_bucket({ name }: { name: string }) {
  return prisma.purpose_bucket.create({ data: { name } }).catch(err => {
    throw new Error(err.message);
  });
}
