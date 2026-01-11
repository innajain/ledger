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

// --- Helper: Get Recent Transactions for Few-Shot Examples ---
async function getRecentTransactions(userId: string, limit: number = 10) {
  const CACHE_KEY = `recent_transactions:${userId}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as string;

  const transactions = await prisma.transaction.findMany({
    where: { user_id: userId },
    include: {
      line_items: {
        include: {
          account: true,
          asset: true,
        },
      },
    },
    orderBy: { datetime: 'desc' },
    take: limit,
  });

  // Format transactions as examples
  const examples = transactions
    .filter(t => t.line_items.length > 0 && t.description != null)
    .map((t, index) => {
      const lineItemsJson = t.line_items.map(li => {
        const quantity = Number(li.quantity);
        const bookValue = li.book_value ? Number(li.book_value) : null;
        const includeBookValue = bookValue !== null && bookValue !== quantity;
        
        return {
          account_name: li.account.name,
          asset_name: li.asset.name,
          quantity,
          ...(includeBookValue ? { book_value: bookValue } : {}),
        };
      });

      const formattedLineItems = JSON.stringify(lineItemsJson, null, 2)
        .split('\n')
        .map((line, i) => (i === 0 ? line : '  ' + line))
        .join('\n');

      return `### Your Transaction ${index + 1}: "${t.description}"
{
  "date": "${t.datetime.toISOString()}",
  "description": "${t.description}",
  "line_items": ${formattedLineItems}
}`;
    })
    .join('\n\n');

  // Cache for 1 hour (transactions change more frequently)
  await redis.setex(CACHE_KEY, 3600, JSON.stringify(examples));
  return examples;
}

// --- MAIN FUNCTION ---
export async function parse_transaction_with_ai(input: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // 1. Fetch entities and recent transactions
    const [entities, recentTransactionExamples] = await Promise.all([
      getEntities(user.id),
      getRecentTransactions(user.id, 10),
    ]);

    const { accounts, assets } = entities;

    // 2. Pre-calculate Date
    const currentISTTime = formatInTimeZone(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");

    // 3. Build Prompt Segments for Caching

    // SEGMENT A: GLOBAL STATIC (Cached across all users)
    const staticSystemPrompt = `You are an AI assistant for a Ledger App. Parse user input into a specific JSON format.

## CRITICAL: Triple Entry System
This ledger uses a "Triple Entry" system - EVERY expense/income transaction MUST have exactly 3 line items:
1. **Real Account** (where money physically is: Google Pay, BHIM, Bank, Wallet, etc.)
2. **Nominal Account** (what type of transaction: Expenses, Income, Salary, etc.)
3. **Allocation Account** (budget category: Office Food, Commute, Discretionary Expenses, Rent, etc.)

**ABSOLUTE RULE:** For EACH asset separately, the sum of quantities across Real accounts MUST EQUAL the sum across Nominal accounts MUST EQUAL the sum across Allocation accounts. This constraint must hold for both quantity and book_value.

## EXPENSE TRANSACTIONS (Most Common)
When user spends money, ALL three quantities are NEGATIVE:
- Real: NEGATIVE (money leaves the account)
- Nominal: NEGATIVE (expense increases in negative direction)
- Allocation: NEGATIVE (budget decreases)

## INCOME TRANSACTIONS
When user receives money, ALL three quantities are POSITIVE.

## TRANSFER TRANSACTIONS (Between Real Accounts Only)
Transfers only involve Real accounts, no Nominal/Allocation needed.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "date": "ISO 8601 datetime string",
  "description": "Brief description",
  "line_items": [
    {"account_name": "Exact account name", "asset_name": "Money", "quantity": number}
  ]
}

REMEMBER: For expenses, quantities are NEGATIVE. For income, quantities are POSITIVE. Always include Real + Nominal + Allocation accounts for expenses/income.`;

    // SEGMENT B: USER CONTEXT (User's accounts, assets, and recent transaction examples)
    const userContextPrompt = `
## YOUR RECENT TRANSACTIONS (Learn from these patterns)
${recentTransactionExamples || 'No recent transactions found. Follow the rules above.'}

## YOUR ACCOUNTS
REAL ACCOUNTS:
${accounts.filter(a => a.type === 'real').map(a => `- ${a.name} (parent: ${a.parent?.name})`).join('\n')}

NOMINAL ACCOUNTS:
${accounts.filter(a => a.type === 'nominal').map(a => `- ${a.name} (parent: ${a.parent?.name})`).join('\n')}

ALLOCATION ACCOUNTS:
${accounts.filter(a => a.type === 'allocation').map(a => `- ${a.name} (parent: ${a.parent?.name})`).join('\n')}

## YOUR ASSETS
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
        patternCuration: null,
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
