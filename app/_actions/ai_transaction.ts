'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import OpenAI from 'openai';
import { formatInTimeZone } from 'date-fns-tz';
import { Prisma } from '@/generated/prisma/client';

// --- Types ---
type AITransactionResponse = {
  date: string;
  description?: string;
  line_items: {
    account_name: string;
    asset_name: string;
    quantity: number | string;
    description?: string | null;
    book_value?: number | null;
  }[];
};

type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

// --- Configuration ---
const modelProvider = process.env.AI_MODEL_PROVIDER || 'groq';
const apiKey = modelProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
if (!apiKey) throw new Error('AI API key not configured');

const openai = new OpenAI({
  apiKey,
  baseURL: modelProvider === 'openai' ? undefined : 'https://api.groq.com/openai/v1',
});

const model = modelProvider === 'openai' ? 'gpt-4o' : 'llama-3.3-70b-versatile';
// --- Helper: Learn User Patterns (Valid Cache Strategy) ---
async function getPatterns(userId: string): Promise<{ patterns: string; usage: TokenUsage | null }> {
  const CACHE_KEY = `patterns:${userId}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return { patterns: cached, usage: null };

  const rawTransactions = await prisma.transaction.findMany({
    where: { user_id: userId },
    include: {
      line_items: {
        include: { account: true, asset: true },
      },
    },
    orderBy: { datetime: 'desc' },
    take: 100,
  });

  if (rawTransactions.length === 0) return { patterns: '', usage: null };

  const simplifiedList = rawTransactions.map(t => ({
    desc: t.description,
    items: t.line_items.map(li => ({
      ac: li.account.name,
      acc_type: li.account.type,
      as: li.asset.name,
      qty: Number(li.quantity),
    })),
  }));

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Analyze the user's transaction data. Find common patterns like:
          - Which real, nominal, and allocation accounts are used for specific transaction types.
          - Which assets are used.
          - Typical quantities.
          
          OUTPUT FORMAT:
          - <pattern 1>
          - <pattern 2>
          ...`,
        },
        { role: 'user', content: JSON.stringify(simplifiedList) },
      ],
      temperature: 0.1,
    });

    const patterns = response.choices[0].message.content || '';

    // Cache for 2 days      temperature: 0.1,

    await redis.setex(CACHE_KEY, 172800, patterns);

    const usage: TokenUsage | null = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null;

    return { patterns, usage };
  } catch (e) {
    return { patterns: '', usage: null };
  }
}

// --- Helper: Fuzzy Matcher ---
function findBestMatch(input: string, items: { id: string; name: string; type: string }[]) {
  const search = input.toLowerCase().trim();

  let match = items.find(i => i.name.toLowerCase() === search);
  if (match) return match;

  match = items.find(i => i.name.toLowerCase().includes(search));
  if (match) return match;

  const words = search.split(' ');
  match = items.find(i => words.some(w => i.name.toLowerCase().includes(w)));

  return match;
}

// --- Helper: Get User Accounts/Assets ---
async function getEntities(userId: string) {
  const CACHE_KEY = `entities:${userId}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached)
    return JSON.parse(cached) as {
      accounts: Prisma.accountGetPayload<{ include: { parent: true } }>[];
      assets: Prisma.assetGetPayload<{ include: { parent: true } }>[];
    };

  const [accounts, assets] = await Promise.all([
    prisma.account.findMany({ where: { user_id: userId }, include: { parent: true } }),
    prisma.asset.findMany({ where: { user_id: userId }, include: { parent: true } }),
  ]);

  const entities = { accounts, assets };
  await redis.setex(CACHE_KEY, 172800, JSON.stringify(entities));
  return entities;
}

// --- MAIN FUNCTION ---
export async function parse_transaction_with_ai(input: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // 1. Fetch Context (Parallel)
    const [patternsData, entities] = await Promise.all([getPatterns(user.id), getEntities(user.id)]);

    const { patterns } = patternsData;
    const { accounts, assets } = entities;

    // 2. Pre-calculate Date (Fixes Timezone Issue)
    // We generate the exact string we want the AI to return
    const currentISTTime = formatInTimeZone(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");

    // 3. Build the FULL System Prompt
    const systemPrompt = `You are an AI assistant for a Ledger App. Your goal is to parse user input into a specific JSON transaction format.

CONTEXT - ACCOUNTS:
REAL ACCOUNTS (Wallets, Banks):
${accounts
  .filter(a => a.type === 'real')
  .map(a => `- ${a.name} (parent: ${a.parent?.name})`)
  .join('\n')}

NOMINAL ACCOUNTS (Income/Expenses):
${accounts
  .filter(a => a.type === 'nominal')
  .map(a => `- ${a.name} (parent: ${a.parent?.name})`)
  .join('\n')}

ALLOCATION ACCOUNTS (Budgets/Envelopes):
${accounts
  .filter(a => a.type === 'allocation')
  .map(a => `- ${a.name} (parent: ${a.parent?.name})`)
  .join('\n')}

ASSETS:
${assets.map(a => `- ${a.name} (${a.type})`).join('\n')}

---

CRITICAL LOGIC RULES (Override Standard Accounting):
This system uses a specific "Triple Entry" consistency. Directions must match across all involved account types.

1. **Expenses / Outflows (Spending money):**
   - Real Account Quantity: **NEGATIVE** (-)
   - Nominal Account Quantity: **NEGATIVE** (-)
   - Allocation Account Quantity: **NEGATIVE** (-)
   *Example: "Lunch 50rs"* -> Google Pay: -50, Expenses: -50, Office Food: -50.

2. **Income / Inflows (Receiving money):**
   - Real Account Quantity: **POSITIVE** (+)
   - Nominal Account Quantity: **POSITIVE** (+)
   - Allocation Account Quantity: **POSITIVE** (+)
   *Example: "Salary 50000"* -> Bank: 50000, Salary: 50000, Unallocated: 50000.

3. **Transfers (Moving money):**
   - Real Accounts sum to 0 (e.g., Bank -500, Wallet +500).
   - Nominal/Allocation are usually not involved, or sum to 0.

**Constraint:** The group-wise sum of quantities for "Real" accounts must equal the sum for "Nominal" accounts, which must equal the sum for "Allocation" accounts. (Equal in Sign AND Magnitude).

---

OTHER INSTRUCTIONS:
1. **Date:** Use this EXACT timestamp string: "${currentISTTime}". Do not calculate or convert timezones yourself.
2. **Book Value:** For non-rupee assets, if book_value is not specified, assume book_value = quantity.
3. **Structure:** Group line items by account type.
4. **Description:** Keep line item descriptions empty unless specific details are needed (e.g., specific stock ticker).

---

USER PATTERNS (Use for inference):
${patterns}

OUTPUT FORMAT (JSON ONLY):
{
  "date": "Use the exact timestamp string provided above",
  "description": "Short description",
  "line_items": [
    { 
      "account_name": "Exact Name from list", 
      "asset_name": "Exact Name from list", 
      "quantity": number, 
      "description": string | null,
      "book_value": number | null
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0, // Strict adherence
    });

    // 4. Resolve & Validate
    const aiResponse: AITransactionResponse = JSON.parse(response.choices[0].message.content || '{}');

    if (!aiResponse.line_items || aiResponse.line_items.length === 0) {
      return {
        success: false,
        message: 'AI returned no line items.',
        usage: null,
      };
    }

    const resolvedLineItems = [];
    const errors: string[] = [];

    for (const li of aiResponse.line_items) {
      const account = findBestMatch(li.account_name, accounts);
      const asset = findBestMatch(li.asset_name, assets);

      if (!account) {
        errors.push(`❌ Account "${li.account_name}" not found.`);
        continue;
      }
      if (!asset) {
        errors.push(`❌ Asset "${li.asset_name}" not found.`);
        continue;
      }

      const quantity = Number(li.quantity);

      resolvedLineItems.push({
        account_id: account.id,
        asset_id: asset.id,
        account_name: account.name,
        account_type: account.type,
        asset_name: asset.name,
        asset_type: asset.type,
        quantity: quantity,
        book_value: li.book_value ?? quantity, // Default to quantity if null
        description: li.description || null,
      });
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: errors.join('\n'),
        usage: null,
      };
    }

    const parsingUsage: TokenUsage | null = response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
          total_tokens: response.usage.total_tokens,
        }
      : null;

    return {
      success: true,
      message: 'Parsed successfully',
      transaction: {
        description: aiResponse.description,
        date: aiResponse.date,
        line_items: resolvedLineItems,
      },
      usage: {
        patternCuration: patternsData.usage,
        transactionParsing: parsingUsage,
      },
    };
  } catch (error) {
    console.error('AI Parse Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to parse transaction',
      usage: null,
    };
  }
}
