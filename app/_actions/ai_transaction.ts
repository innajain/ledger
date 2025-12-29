'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import OpenAI from 'openai';
import type { Prisma } from '@/generated/prisma/client';

type AITransactionResponse = {
  date: string;
  description?: string;
  line_items: {
    account_name: string;
    asset_name: string;
    quantity: number;
    description?: string;
  }[];
};

type TransactionWithLineItems = Prisma.transactionGetPayload<{
  include: {
    line_items: {
      include: { account: true; asset: true };
    };
  };
}>;

type AccountSelect = {
  id: string;
  name: string;
  type: 'real' | 'nominal' | 'allocation';
};

type AssetSelect = {
  id: string;
  name: string;
  type: string | null;
};

export async function parse_transaction_with_ai(input: string): Promise<{
  success: boolean;
  message: string;
  transaction?: {
    description?: string;
    date: string;
    line_items: {
      account_name: string;
      account_type: string;
      asset_name: string;
      asset_type?: string | null;
      quantity: number;
      book_value: number | null;
      description?: string | null;
    }[];
  };
}> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY not configured');
    }

    const CACHE_TTL = 60 * 60 * 24 * 2; // 2 days in seconds
    const cacheKey = `ai_context:${user.id}`;

    // Try to get cached data
    let cachedData = await redis.get(cacheKey);
    let transactions: TransactionWithLineItems[];
    let accounts: AccountSelect[];
    let assets: AssetSelect[];

    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      transactions = parsed.transactions;
      accounts = parsed.accounts;
      assets = parsed.assets;
    } else {
      // Cache miss - fetch from DB
      transactions = await prisma.transaction.findMany({
        where: { user_id: user.id },
        include: {
          line_items: {
            include: { account: true, asset: true },
            orderBy: { id: 'asc' },
          },
        },
        orderBy: { datetime: 'desc' },
        take: 30,
      });

      [accounts, assets] = await Promise.all([
        prisma.account.findMany({
          where: { user_id: user.id },
          select: { id: true, name: true, type: true },
        }),
        prisma.asset.findMany({
          where: { user_id: user.id },
          select: { id: true, name: true, type: true },
        }),
      ]);

      // Cache for 2 days
      await redis.setex(cacheKey, CACHE_TTL, JSON.stringify({ transactions, accounts, assets }));
    }

    // Build examples focusing on common patterns
    const simpleExamples = transactions.map(t => ({
      description: t.description,
      line_items: t.line_items.map(li => ({
        account: li.account.name,
        account_type: li.account.type,
        asset: li.asset.name,
        quantity: Number(li.quantity),
        description: li.description,
      })),
    }));

    // Group accounts
    const accountsByType = {
      real: accounts.filter(a => a.type === 'real'),
      allocation: accounts.filter(a => a.type === 'allocation'),
      nominal: accounts.filter(a => a.type === 'nominal'),
    };

    const systemPrompt = `You are a ledger assistant. Parse transactions into line items following the user's exact patterns.

═══════════════════════════════════════════════════════════
AVAILABLE ACCOUNTS
═══════════════════════════════════════════════════════════

REAL (Payment Methods):
${accountsByType.real.map(a => `  • ${a.name}`).join('\n')}

ALLOCATION (Budget Categories):
${accountsByType.allocation.map(a => `  • ${a.name}`).join('\n')}

NOMINAL (Income/Expense Tracking):
${accountsByType.nominal.map(a => `  • ${a.name}`).join('\n')}

ASSETS:
${assets.map(a => `  • ${a.name}${a.type ? ` (${a.type})` : ''}`).join('\n')}

═══════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════
Asset-wise sum of quantities should be equal in all account types.

═══════════════════════════════════════════════════════════
REAL EXAMPLES FROM USER'S LEDGER
═══════════════════════════════════════════════════════════
From these examples, learn these things:
- How transactions are structured
- Typical accounts and assets used
- Common quantity patterns
- How descriptions are formatted
- Try to learn patterns of which accounts and assets are used for what kinds of transactions. Also try to learn patterns of which accounts and assets are used together. Use these patterns to guide your selections when multiple options are possible or when the input is ambiguous.

${JSON.stringify(simpleExamples, null, 2)}


═══════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no explanation):

{
  "date": "ISO 8601 datetime string",
  "description": "brief transaction description",
  "line_items": [
    {
      "account_name": "exact account name from list",
      "asset_name": "money",
      "quantity": -50,
      "description": "optional item detail"
    }
  ]
}

Current time in India: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })}`;

    const openai = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1', // Standard Groq URL
    });

    const response = await openai.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const rawContent = response.choices[0].message.content || '{}';
    console.log('AI Raw Response:', rawContent);

    const aiResponse: AITransactionResponse = JSON.parse(rawContent);

    if (!aiResponse.line_items || aiResponse.line_items.length === 0) {
      return {
        success: false,
        message: 'AI returned no line items. Please try rephrasing your transaction.',
      };
    }

    // Resolve accounts and assets
    type ResolvedLineItem = {
      account_id: string;
      asset_id: string;
      account_name: string;
      account_type: 'real' | 'nominal' | 'allocation';
      asset_name: string;
      asset_type: string | null;
      quantity: number;
      book_value: number | null;
      description: string | null;
    };

    const resolvedLineItems: ResolvedLineItem[] = [];
    const errors: string[] = [];

    for (const li of aiResponse.line_items) {
      // Account matching with fallback
      let account = accounts.find(a => a.name.toLowerCase() === li.account_name.toLowerCase());

      if (!account) {
        const searchLower = li.account_name.toLowerCase();
        const matches = accounts.filter(a => {
          const nameLower = a.name.toLowerCase();
          return (
            nameLower.includes(searchLower) ||
            searchLower.includes(nameLower) ||
            nameLower.split(' ').some((word: string) => searchLower.includes(word))
          );
        });

        if (matches.length === 0) {
          errors.push(
            `❌ Account "${li.account_name}" not found.\n\n💡 Did you mean one of these?\n${accounts
              .filter(a => a.type === 'real')
              .slice(0, 10)
              .map(a => `   • ${a.name}`)
              .join('\n')}\n\nSee all accounts in settings.`
          );
          continue;
        }

        // Pick best match
        account = matches.sort((a, b) => b.name.length - a.name.length)[0];
      }

      // Asset matching
      let asset = assets.find(a => a.name.toLowerCase() === li.asset_name.toLowerCase());

      if (!asset) {
        const searchLower = li.asset_name.toLowerCase();
        const matches = assets.filter(a => a.name.toLowerCase().includes(searchLower));

        if (matches.length === 0) {
          errors.push(`❌ Asset "${li.asset_name}" not found. Using "money" as default might work.`);
          continue;
        }
        asset = matches[0];
      }

      const quantity = typeof li.quantity === 'string' ? parseFloat(li.quantity) : li.quantity;

      resolvedLineItems.push({
        account_id: account.id,
        asset_id: asset.id,
        account_name: account.name,
        account_type: account.type,
        asset_name: asset.name,
        asset_type: asset.type,
        quantity,
        book_value: asset.type === 'rupees' ? null : quantity,
        description: li.description || null,
      });
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: errors.join('\n\n'),
      };
    }

    return {
      success: true,
      message: '✓ Transaction ready',
      transaction: {
        description: aiResponse.description,
        date: aiResponse.date,
        line_items: resolvedLineItems,
      },
    };
  } catch (error) {
    console.error('AI transaction error:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Failed to parse transaction'}`,
    };
  }
}
