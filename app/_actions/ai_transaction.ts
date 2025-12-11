'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { CreateLineItemInput } from './transactions';
import OpenAI from 'openai';

type AITransactionResponse = {
  date: string;
  description?: string;
  line_items: {
    account_name: string;
    asset_name: string;
    quantity: number;
  }[];
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
      asset_type?: string;
      quantity: number;
      book_value: number | null;
      description?: string | null;
    }[];
  };
}> {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Get recent transactions to learn patterns
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

    // Build a simple context with real examples
    const examples = transactions.slice(0, 5).map(t => ({
      description: t.description || 'No description',
      line_items: t.line_items.map(li => ({
        account: li.account.name,
        account_type: li.account.type,
        asset: li.asset.name,
        quantity: li.quantity.toString(),
      })),
    }));

    const systemPrompt = `You are a ledger assistant. Parse the user's transaction request into line items.

EXAMPLE TRANSACTIONS FROM USER'S LEDGER:
${JSON.stringify(examples, null, 2)}

RULES:
1. Study the examples above - use the EXACT account and asset names you see
2. For expenses: Real account negative, Allocation account negative, Expenses positive
3. Balancing: Real sum = Allocation sum, and Nominal = absolute value of Real (NOT doubled)
4. Use "Refundable Money" asset for rupees unless specified otherwise

IMPORTANT ACCOUNT MATCHING:
- If user says "SBI card" or "sbi card" → Use "SBI Card" (the credit card account)
- If user says "discretionary daily" → Use "Discretionary Expenses - Daily"
- Match to accounts you see in the examples above

Return JSON:
{
  "date": "ISO date",
  "description": "brief description",
  "line_items": [
    {
      "account_name": "exact name from examples",
      "asset_name": "exact asset name",
      "quantity": number (negative for outgoing, positive for incoming)
    }
  ]
}

Current date: ${new Date().toISOString()}`;

    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const rawContent = response.choices[0].message.content || '{}';
    const aiResponse: AITransactionResponse = JSON.parse(rawContent);

    if (!aiResponse.line_items || aiResponse.line_items.length === 0) {
      return {
        success: false,
        message: 'AI returned invalid response',
      };
    }

    // Get all accounts and assets for ID resolution
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

    // Resolve names to IDs with fuzzy matching
    const line_items: CreateLineItemInput[] = [];
    const resolvedLineItems: any[] = [];

    for (const li of aiResponse.line_items) {
      // Find account (case-insensitive, fuzzy)
      let account = accounts.find(a => a.name.toLowerCase() === li.account_name.toLowerCase());
      if (!account) {
        // Fuzzy match - prefer longer names
        const matches = accounts
          .filter(a => a.name.toLowerCase().includes(li.account_name.toLowerCase()) || li.account_name.toLowerCase().includes(a.name.toLowerCase()))
          .sort((a, b) => b.name.length - a.name.length);

        if (matches.length === 0) {
          return {
            success: false,
            message: `Account "${li.account_name}" not found. Available:\n${accounts.map(a => `- ${a.name}`).join('\n')}`,
          };
        }
        account = matches[0];
      }

      // Find asset
      let asset = assets.find(a => a.name.toLowerCase() === li.asset_name.toLowerCase());
      if (!asset) {
        const matches = assets.filter(a => a.name.toLowerCase().includes(li.asset_name.toLowerCase()));
        if (matches.length === 0) {
          return {
            success: false,
            message: `Asset "${li.asset_name}" not found`,
          };
        }
        asset = matches[0];
      }

      const quantity = typeof li.quantity === 'string' ? parseFloat(li.quantity) : li.quantity;

      line_items.push({
        account_id: account.id,
        asset_id: asset.id,
        quantity,
        book_value: asset.type === 'rupees' ? null : quantity,
      });

      resolvedLineItems.push({
        account_name: account.name,
        account_type: account.type,
        asset_name: asset.name,
        asset_type: asset.type,
        quantity,
        book_value: asset.type === 'rupees' ? null : quantity,
      });
    }

    return {
      success: true,
      message: 'Transaction ready',
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
      message: error instanceof Error ? error.message : 'Failed to parse transaction',
    };
  }
}
