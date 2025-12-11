'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';

/**
 * Fetches the training data export from the API
 * This includes all schema, code, and transaction data for AI learning
 */
export async function get_training_data_for_ai(): Promise<string> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // In a server action, we can't call the API directly, so we read the data again
    // Alternatively, you could call the /api/export-training-data endpoint from client
    // and pass it to the AI

    const [accounts, assets, transactions] = await Promise.all([
      prisma.account.findMany({
        where: { user_id: user.id },
        include: { children: true },
      }),
      prisma.asset.findMany({
        where: { user_id: user.id },
        include: { children: true },
      }),
      prisma.transaction.findMany({
        where: { user_id: user.id },
        include: { line_items: { include: { account: true, asset: true } } },
        orderBy: { date: 'desc' },
        take: 100, // Get more for training
      }),
    ]);

    let trainingText = `# LEDGER TRAINING DATA

## DATABASE STATE SUMMARY
- Accounts: ${accounts.length}
- Assets: ${assets.length}
- Transactions: ${transactions.length}

## ACCOUNTS
\`\`\`json
${JSON.stringify(
  accounts.map(a => ({
    name: a.name,
    type: a.type,
    children: a.children.map(c => c.name),
  })),
  null,
  2
)}
\`\`\`

## ASSETS
\`\`\`json
${JSON.stringify(
  assets.map(a => ({
    name: a.name,
    type: a.type,
    ticker: a.ticker,
  })),
  null,
  2
)}
\`\`\`

## RECENT TRANSACTIONS (Examples for learning patterns)
\`\`\`json
${JSON.stringify(
  transactions.slice(0, 20).map(t => ({
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
)}
\`\`\`

## ANALYSIS
Most common transactions: ${getTopTransactions(transactions)}
Most common payment methods: ${getTopPaymentMethods(transactions)}
Most common categories: ${getTopCategories(transactions)}
`;

    return trainingText;
  } catch (error) {
    console.error('Error getting training data:', error);
    throw new Error('Failed to fetch training data');
  }
}

function getTopTransactions(transactions: any[]): string {
  const descriptions: Record<string, number> = {};
  transactions.forEach(t => {
    if (t.description) {
      descriptions[t.description] = (descriptions[t.description] || 0) + 1;
    }
  });
  const top = Object.entries(descriptions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([desc, count]) => `${desc} (${count}x)`)
    .join(', ');
  return top || 'none';
}

function getTopPaymentMethods(transactions: any[]): string {
  const methods: Record<string, number> = {};
  transactions.forEach(t => {
    t.line_items.forEach((li: any) => {
      if (li.account_type === 'real') {
        methods[li.account.name] = (methods[li.account.name] || 0) + 1;
      }
    });
  });
  const top = Object.entries(methods)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([method, count]) => `${method} (${count}x)`)
    .join(', ');
  return top || 'none';
}

function getTopCategories(transactions: any[]): string {
  const categories: Record<string, number> = {};
  transactions.forEach(t => {
    t.line_items.forEach((li: any) => {
      if (li.account_type === 'allocation') {
        categories[li.account.name] = (categories[li.account.name] || 0) + 1;
      }
    });
  });
  const top = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([category, count]) => `${category} (${count}x)`)
    .join(', ');
  return top || 'none';
}
