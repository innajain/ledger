'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

/**
 * Gathers comprehensive context about the user's ledger setup
 * including database data, schema, and relevant code
 */
export async function get_ai_learning_context(): Promise<string> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // 1. Get all user data
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
        take: 20,
      }),
    ]);

    // 2. Read Prisma schema
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    // 3. Read relevant server actions
    const actionsDir = path.join(process.cwd(), 'app', '_actions');
    const transactionsActionPath = path.join(actionsDir, 'transactions.ts');
    const transactionsAction = await fs.readFile(transactionsActionPath, 'utf-8');

    // 4. Build comprehensive context string
    // Extract unique accounts/assets from transactions FIRST
    const accountsInUse = Array.from(
      new Set(transactions.flatMap(t => t.line_items.map(li => ({ id: li.account.id, name: li.account.name, type: li.account.type }))))
    );
    const assetsInUse = Array.from(
      new Set(transactions.flatMap(t => t.line_items.map(li => ({ id: li.asset.id, name: li.asset.name, type: li.asset.type }))))
    );

    let context = `# LEDGER SYSTEM CONTEXT

⚠️ ⚠️ ⚠️ CRITICAL - YOU MUST ONLY USE THESE ACCOUNTS AND ASSETS ⚠️ ⚠️ ⚠️

## ACCOUNTS YOU CAN USE (from Recent Transactions)
Only use accounts from this list. Do NOT use accounts from the full list below.
\`\`\`json
${JSON.stringify(accountsInUse, null, 2)}
\`\`\`

## ASSETS YOU CAN USE (from Recent Transactions)  
Only use assets from this list. Do NOT use assets from the full list below.
\`\`\`json
${JSON.stringify(assetsInUse, null, 2)}
\`\`\`

## PATTERN ANALYSIS
${generatePatterns(transactions, accounts, assets)}

---

## RECENT TRANSACTIONS (last 20)
Study these to understand the user's transaction patterns and account/asset combinations.
\`\`\`json
${JSON.stringify(
  transactions.map(t => ({
    id: t.id,
    date: t.date,
    description: t.description,
    line_items: t.line_items.map(li => ({
      account_id: li.account_id,
      account_name: li.account.name,
      account_type: li.account.type,
      asset_id: li.asset_id,
      asset_name: li.asset.name,
      asset_type: li.asset.type,
      quantity: li.quantity.toString(),
      book_value: li.book_value?.toString() || null,
      description: li.description,
    })),
  })),
  null,
  2
)}
\`\`\`

---
REFERENCE ONLY - DO NOT PICK FROM THESE LISTS
The following are full lists for reference only. Many are parent accounts/assets that should NOT be used in transactions.

### All Accounts (${accounts.length} total) - FOR REFERENCE ONLY
\`\`\`json
${JSON.stringify(
  accounts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    parent_id: a.parent_id,
    children_count: a.children.length,
  })),
  null,
  2
)}
\`\`\`

### All Assets (${assets.length} total) - FOR REFERENCE ONLY
\`\`\`json
${JSON.stringify(
  assets.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    ticker: a.ticker,
    children_count: a.children.length,
  })),
  null,
  2
)}
\`\`\`

## DATABASE SCHEMA
\`\`\`prisma
${schema}
\`\`\`

## SERVER TRANSACTION LOGIC
\`\`\`typescript
${transactionsAction}
\`\`\`
`;

    return context;
  } catch (error) {
    console.error('Error gathering AI context:', error);
    throw new Error('Failed to gather learning context');
  }
}

/**
 * Analyzes transaction patterns to help AI understand common patterns
 */
function generatePatterns(transactions: any[], accounts: any[], assets: any[]): string {
  if (transactions.length === 0) return '- No transactions yet';

  const patterns: string[] = [];

  // Find most common payment methods (real accounts)
  const realAccounts = accounts.filter(a => a.type === 'real');
  const paymentMethods = new Map<string, number>();

  transactions.forEach(t => {
    t.line_items.forEach((li: any) => {
      if (li.account_type === 'real') {
        paymentMethods.set(li.account_name, (paymentMethods.get(li.account_name) || 0) + 1);
      }
    });
  });

  if (paymentMethods.size > 0) {
    patterns.push('- Common payment methods:');
    Array.from(paymentMethods.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([name, count]) => {
        patterns.push(`  - ${name} (${count} transactions)`);
      });
  }

  // Find most common categories (allocation accounts)
  const categories = new Map<string, number>();
  transactions.forEach(t => {
    t.line_items.forEach((li: any) => {
      if (li.account_type === 'allocation') {
        categories.set(li.account_name, (categories.get(li.account_name) || 0) + 1);
      }
    });
  });

  if (categories.size > 0) {
    patterns.push('- Most used categories:');
    Array.from(categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([name, count]) => {
        patterns.push(`  - ${name} (${count} transactions)`);
      });
  }

  // Find common expense/income sources
  const expenseSources = new Map<string, number>();
  transactions.forEach(t => {
    t.line_items.forEach((li: any) => {
      if (li.account_type === 'nominal') {
        expenseSources.set(li.account_name, (expenseSources.get(li.account_name) || 0) + 1);
      }
    });
  });

  if (expenseSources.size > 0) {
    patterns.push('- Common income/expense accounts:');
    Array.from(expenseSources.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        patterns.push(`  - ${name} (${count} transactions)`);
      });
  }

  return patterns.length > 0 ? patterns.join('\n') : '- No clear patterns yet (add more transactions)';
}

/**
 * Get just the summary context (lighter weight, for quick AI calls)
 */
export async function get_ai_context_summary(): Promise<string> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
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

    return `# LEDGER CONTEXT

**Available Accounts:**
${accounts.map(a => `- ${a.name} (${a.type})`).join('\n') || 'None yet'}

**Available Assets:**
${assets.map(a => `- ${a.name} (${a.type})`).join('\n') || 'None yet'}

**Rules:**
1. Real + Allocation quantities must balance per asset
2. Real + Nominal book_values must sum to 0
3. Allocation + Nominal book_values must sum to 0
4. Rupees assets: book_value = null (quantity IS value)
5. Other assets: book_value is required`;
  } catch (error) {
    console.error('Error gathering context summary:', error);
    throw new Error('Failed to gather context');
  }
}
