'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';

/**
 * Simple context generator - just returns recent transactions as examples
 */
export async function get_ai_learning_context(): Promise<string> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  const transactions = await prisma.transaction.findMany({
    where: { user_id: user.id },
    include: {
      line_items: {
        include: { account: true, asset: true },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { date: 'desc' },
    take: 10,
  });

  return JSON.stringify(
    transactions.map(t => ({
      description: t.description,
      line_items: t.line_items.map(li => ({
        account: li.account.name,
        account_type: li.account.type,
        asset: li.asset.name,
        quantity: li.quantity.toString(),
      })),
    })),
    null,
    2
  );
}

export async function get_ai_context_summary(): Promise<string> {
  return get_ai_learning_context();
}
