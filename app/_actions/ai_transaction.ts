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

// --- MAIN FUNCTION ---
export async function parse_transaction_with_ai(input: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // 1. Fetch entities 
    const entities = await getEntities(user.id);

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

### Example 1: "breakfast 50rs using gpay"
{
  "date": "2024-01-15T10:00:00+05:30",
  "description": "breakfast",
  "line_items": [
    {"account_name": "Google Pay", "asset_name": "Money", "quantity": -50},
    {"account_name": "Expenses", "asset_name": "Money", "quantity": -50},
    {"account_name": "Office Food", "asset_name": "Money", "quantity": -50}
  ]
}

### Example 2: "lunch 35 from bhim"
{
  "date": "2024-01-15T13:00:00+05:30",
  "description": "lunch",
  "line_items": [
    {"account_name": "BHIM", "asset_name": "Money", "quantity": -35},
    {"account_name": "Expenses", "asset_name": "Money", "quantity": -35},
    {"account_name": "Office Food", "asset_name": "Money", "quantity": -35}
  ]
}

### Example 3: "uber 200 from wallet"
{
  "date": "2024-01-15T18:00:00+05:30",
  "description": "uber",
  "line_items": [
    {"account_name": "Wallet", "asset_name": "Money", "quantity": -200},
    {"account_name": "Expenses", "asset_name": "Money", "quantity": -200},
    {"account_name": "Commute", "asset_name": "Money", "quantity": -200}
  ]
}

### Example 4: "metro 10 rs"
{
  "date": "2024-01-15T09:00:00+05:30",
  "description": "metro",
  "line_items": [
    {"account_name": "Google Pay", "asset_name": "Money", "quantity": -10},
    {"account_name": "Expenses", "asset_name": "Money", "quantity": -10},
    {"account_name": "Commute", "asset_name": "Money", "quantity": -10}
  ]
}

### Example 5: "rent 25000"
{
  "date": "2024-01-01T12:00:00+05:30",
  "description": "rent",
  "line_items": [
    {"account_name": "SBI", "asset_name": "Money", "quantity": -25000},
    {"account_name": "Expenses", "asset_name": "Money", "quantity": -25000},
    {"account_name": "Rent", "asset_name": "Money", "quantity": -25000}
  ]
}

## INCOME TRANSACTIONS
When user receives money, ALL three quantities are POSITIVE:

### Example 6: "salary 50000 deposited to bank"
{
  "date": "2024-01-01T10:00:00+05:30",
  "description": "salary",
  "line_items": [
    {"account_name": "IDFC", "asset_name": "Money", "quantity": 50000},
    {"account_name": "Salary", "asset_name": "Money", "quantity": 50000},
    {"account_name": "Buffer in Bank", "asset_name": "Money", "quantity": 50000}
  ]
}

## TRANSFER TRANSACTIONS (Between Real Accounts Only)
Transfers only involve Real accounts, no Nominal/Allocation needed:

### Example 7: "transfer 1000 from idfc to wallet"
{
  "date": "2024-01-15T12:00:00+05:30",
  "description": "transfer",
  "line_items": [
    {"account_name": "IDFC", "asset_name": "Money", "quantity": -1000},
    {"account_name": "Wallet", "asset_name": "Money", "quantity": 1000}
  ]
}

## COMMON ALLOCATION MAPPINGS
- Food at office → "Office Food"
- Cab/Auto/Metro/Uber/Rapido → "Commute"
- Weekend activities/movies → "Discretionary Expenses - Weekend"
- General shopping/snacks → "Discretionary Expenses"
- Monthly rent → "Rent"
- Phone recharge → "Mobile Recharge"
- Electricity bill → "Electricity"

## COMMON REAL ACCOUNT MAPPINGS
- gpay/google pay → "Google Pay"
- bhim/upi → "BHIM"
- wallet/cash → "Wallet"
- bank/idfc → "IDFC"
- sbi → "SBI"
- kotak → "Kotak"
- credit card/axis card → "Axis Card"
- sbi card → "SBI Card"

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
