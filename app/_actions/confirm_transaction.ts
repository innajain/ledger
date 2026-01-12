'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { create_transaction, CreateLineItemInput } from './transactions';

export async function confirm_and_create_transaction(
  description: string,
  date: string,
  line_items: {
    account_name: string;
    account_type: string;
    asset_name: string;
    quantity: number;
    book_value?: number | null;
    description?: string | null;
  }[]
): Promise<{ success: boolean; message: string }> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // Fetch accounts and assets
    const [accounts, assets] = await Promise.all([
      prisma.account.findMany({
        where: { user_id: user.id },
        select: { id: true, name: true, type: true },
      }),
      prisma.asset.findMany({
        where: { user_id: user.id },
        select: { id: true, name: true, type: true },
      }),
    ]);

    // Create maps for lookup
    const accountMap = new Map(accounts.map(a => [a.name.toLowerCase(), a]));
    const assetMap = new Map(assets.map(a => [a.name.toLowerCase(), a]));

    // Convert line items to CreateLineItemInput
    const createLineItems: CreateLineItemInput[] = line_items.map(li => {
      const account = accountMap.get(li.account_name.toLowerCase());
      const asset = assetMap.get(li.asset_name.toLowerCase());

      if (!account || !asset) {
        throw new Error(`Invalid account or asset: ${li.account_name}, ${li.asset_name}`);
      }

      return {
        account_id: account.id,
        asset_id: asset.id,
        quantity: li.quantity,
        book_value: li.book_value,
        description: li.description,
      };
    });

    // Create the transaction
    const transactionDate = new Date(date);
    const result = await create_transaction(transactionDate, createLineItems, description);

    if (!result.success) {
      throw new Error(result.message);
    }

    return {
      success: true,
      message: `Transaction created: ${description || 'No description'}`,
    };
  } catch (error) {
    console.error('Error confirming transaction:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create transaction',
    };
  }
}
