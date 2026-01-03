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
    });

    const patterns = response.choices[0].message.content || '';

    // Cache for 2 days
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

    // 2. Pre-calculate Date
    const currentISTTime = formatInTimeZone(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");

    // 3. Build Prompt Segments for Caching

    // SEGMENT A: GLOBAL STATIC (Cached across all users)
    const staticSystemPrompt = `You are an AI assistant for a Ledger App. Parse user input into a specific JSON format.

CRITICAL LOGIC RULES (Override Standard Accounting):
This system uses a specific "Triple Entry" consistency. Directions must match across all involved account types. A transaction is a collection of line items. each line item is related to an account. there are 3 types of accounts: real, allocation and nominal.
**Constraint:** For each asset, the group-wise sum of quantities for "Real" accounts must equal "Nominal", which must equal "Allocation". (Equal in Sign AND Magnitude). also, the group-wise sum of book_values for "Real", "Nominal", and "Allocation" must be equal. book_value defaults to quantity for rupee assets.

1. **Expenses / Outflows:**
   - Real Account Quantity: **NEGATIVE** (-)
   - Nominal Account Quantity: **NEGATIVE** (-)
   - Allocation Account Quantity: **NEGATIVE** (-)
   *Example: "Lunch 50rs"* -> Google Pay: -50, Expenses: -50, Office Food: -50.

2. **Income / Inflows:**
   - Real Account Quantity: **POSITIVE** (+)
   - Nominal Account Quantity: **POSITIVE** (+)
   - Allocation Account Quantity: **POSITIVE** (+)
   *Example: "Salary 50000"* -> Bank: 50000, Salary: 50000, Unallocated: 50000.

3. **Transfers:**
   - Real Accounts sum to 0 (e.g., Bank -500, Wallet +500).
   - Nominal/Allocation are usually not involved.

4. **Other Transactions:**
   - In general. there can be any number of line items for each account type. some could have positive quantities, some negative. it is totally generalised. Only thing is that the following constraint must be met:

I want you to be extra careful while verifying for this constraint because this is different from standard accounting principles, on which you may have been trained. Do this: seggregate line items by account type. Then, for each asset, sum up the quantities in real accounts, nominal accounts, and allocation accounts. do not skip considering those type of accounts which have no line items. the sum of quantities for each asset shall be equal in all three account types.

add line item descriptions only if necessary and if it provides additional info about that line item. otherwise usually only transaction level description suffice.
for transactions with cashbacks, do like this: let's say expense was 100 rs and cashback was 3rs, so there shall be a line item for the real acc from which 100rs went out, a line item for the real acc to which cashback was credited, a line item for allocation account from which 97 rs went out in effect, a line item for nominal account for 100rs expense and a line item for nominal acc for 3 rs cashback
book_value field must be null for rupees type assets

OUTPUT FORMAT (JSON ONLY):
{
  "date": "ISO string provided in user context",
  "description": "Short description",
  "line_items": [
    { 
      "account_name": "Exact Name from list", 
      "asset_name": "Exact Name from list" ("Money" mostly), 
      "quantity": number, 
      "description": string | null,
      "book_value": number | null (null mostly)
    }
  ]
}`;

    // SEGMENT B: USER STATIC (Cached for this specific user)
    // We attach this to the System prompt. Since it comes after staticSystemPrompt, 
    // the first part remains cached globally, and this combo is cached per user.
    const userContextPrompt = `
CONTEXT - ACCOUNTS:
REAL ACCOUNTS:
${accounts.filter(a => a.type === 'real').map(a => `- ${a.name} (parent: ${a.parent?.name})`).join('\n')}

NOMINAL ACCOUNTS:
${accounts.filter(a => a.type === 'nominal').map(a => `- ${a.name} (parent: ${a.parent?.name})`).join('\n')}

ALLOCATION ACCOUNTS:
${accounts.filter(a => a.type === 'allocation').map(a => `- ${a.name} (parent: ${a.parent?.name})`).join('\n')}

ASSETS:
${assets.map(a => `- ${a.name} (${a.type})`).join('\n')}
`;

    // SEGMENT C: DYNAMIC (Never Cached)
    // This goes into the User message so it doesn't break the System prompt cache prefix.
    const dynamicUserPrompt = `
CURRENT TIMESTAMP: ${currentISTTime}
INSTRUCTION: Use the timestamp above for the "date" field, if no other datetime is specified in the input.
Book Value Rule: For non-rupee assets, if book_value is not specified, assume book_value = quantity.

USER INPUT:
${input}`;

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { 
            role: 'system', 
            content: staticSystemPrompt + "\n\n" + userContextPrompt 
        },
        { 
            role: 'user', 
            content: dynamicUserPrompt 
        },
      ],
      response_format: { type: 'json_object' },
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
        book_value: li.book_value ?? quantity,
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
