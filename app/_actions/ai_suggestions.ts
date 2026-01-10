'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { query_ai } from '@/app/_utils/ai_helper';

/**
 * Suggest account names based on user's existing accounts and a description
 */
export async function suggest_account_name(description: string, type: 'real' | 'nominal' | 'allocation') {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    const existingAccounts = await prisma.account.findMany({
      where: { user_id: user.id, type },
      select: { name: true, parent: { select: { name: true } } },
    });

    const systemPrompt = `You are a financial account naming assistant for a ledger application.
Based on the user's existing accounts and a description, suggest appropriate account names.

Existing ${type} accounts:
${existingAccounts.map(a => `- ${a.name}${a.parent ? ` (child of ${a.parent.name})` : ''}`).join('\n') || 'None yet'}

Guidelines:
- Keep names concise but descriptive (2-4 words)
- Use title case (e.g., "Bank Account" not "bank account")
- Be consistent with existing naming patterns
- For real accounts: Examples like "HDFC Bank", "Cash Wallet", "Credit Card"
- For nominal accounts: Examples like "Salary Income", "Groceries", "Utilities"
- For allocation accounts: Examples like "Emergency Fund", "Vacation", "Investments"

Return JSON with:
{
  "suggestions": ["Name 1", "Name 2", "Name 3"],
  "recommended": "Name 1",
  "parentSuggestion": "Parent Account Name or null"
}`;

    const result = await query_ai(systemPrompt, description, {
      json: true,
      temperature: 0.7,
    });

    return result;
  } catch (error) {
    console.error('Suggest Account Name Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to suggest account name',
    };
  }
}

/**
 * Suggest asset names based on user's existing assets and a description
 */
export async function suggest_asset_name(description: string, type: 'rupees' | 'mf' | 'etf' | 'shares' | 'other') {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    const existingAssets = await prisma.asset.findMany({
      where: { user_id: user.id, type },
      select: { name: true, ticker: true, parent: { select: { name: true } } },
    });

    const systemPrompt = `You are a financial asset naming assistant for a ledger application.
Based on the user's existing assets and a description, suggest appropriate asset names.

Existing ${type} assets:
${existingAssets.map(a => `- ${a.name}${a.ticker ? ` (${a.ticker})` : ''}${a.parent ? ` (child of ${a.parent.name})` : ''}`).join('\n') || 'None yet'}

Guidelines:
- Keep names clear and specific
- Use proper case
- For mutual funds: Include fund house and scheme name
- For ETFs/Shares: Use company name or standard ticker name
- For rupees: Use currency descriptors like "Indian Rupees", "Cash (INR)"
- Be consistent with existing naming patterns

Return JSON with:
{
  "suggestions": ["Name 1", "Name 2", "Name 3"],
  "recommended": "Name 1",
  "tickerSuggestion": "TICKER or null",
  "parentSuggestion": "Parent Asset Name or null"
}`;

    const result = await query_ai(systemPrompt, description, {
      json: true,
      temperature: 0.7,
    });

    return result;
  } catch (error) {
    console.error('Suggest Asset Name Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to suggest asset name',
    };
  }
}

/**
 * Suggest transaction categorization based on description and past patterns
 */
export async function suggest_transaction_categories(description: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // Get recent transactions to learn patterns
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        line_items: {
          some: {
            account: { user_id: user.id },
          },
        },
      },
      include: {
        line_items: {
          include: {
            account: true,
            asset: true,
          },
        },
      },
      orderBy: { datetime: 'desc' },
      take: 50,
    });

    // Extract patterns
    const patterns = recentTransactions.map(t => ({
      description: t.description,
      accounts: t.line_items.map(li => ({ name: li.account.name, type: li.account.type })),
      assets: t.line_items.map(li => li.asset.name),
    }));

    const systemPrompt = `You are a transaction categorization assistant for a ledger application.
Based on a transaction description and the user's past transaction patterns, suggest appropriate accounts.

Past transaction patterns:
${patterns.slice(0, 20).map(p => `"${p.description}" → Accounts: ${p.accounts.map(a => a.name).join(', ')}`).join('\n')}

The user uses a triple-entry bookkeeping system with:
- Real accounts (assets/liabilities): Bank, Wallet, Credit Card, etc.
- Nominal accounts (income/expenses): Salary, Groceries, Utilities, etc.  
- Allocation accounts (budget categories): Food Budget, Entertainment, etc.

Return JSON with:
{
  "suggestedAccounts": [
    { "type": "real", "name": "Account Name", "confidence": "high|medium|low" },
    { "type": "nominal", "name": "Account Name", "confidence": "high|medium|low" },
    { "type": "allocation", "name": "Account Name", "confidence": "high|medium|low" }
  ],
  "reasoning": "Brief explanation of why these accounts fit"
}`;

    const result = await query_ai(systemPrompt, `Transaction description: "${description}"`, {
      json: true,
      temperature: 0.5,
      cache_key: `suggestions:${user.id}:${description.slice(0, 50)}`,
      cache_ttl: 1800, // 30 minutes
    });

    return result;
  } catch (error) {
    console.error('Suggest Categories Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to suggest categories',
    };
  }
}
