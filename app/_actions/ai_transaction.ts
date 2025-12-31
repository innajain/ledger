'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import OpenAI from 'openai';
import { formatInTimeZone } from 'date-fns-tz';

type AITransactionResponse = {
  date: string;
  description?: string;
  line_items: {
    account_name: string;
    asset_name: string;
    quantity: number | string;
    description?: string;
  }[];
};

type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type ConversationContext = {
  timestamp: number;
  accountsDigest: string;
  assetsDigest: string;
  patternsDigest: string;
};

async function getSmartExamples(userId: string): Promise<{ examples: any[]; usage: TokenUsage | null }> {
  const CACHE_KEY = `ai_patterns_v2:${userId}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return { examples: JSON.parse(cached), usage: null };

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

  if (rawTransactions.length === 0) return { examples: [], usage: null };

  const simplifiedList = rawTransactions.map(t => ({
    desc: t.description,
    items: t.line_items.map(li => ({
      ac: li.account.name,
      as: li.asset.name,
      qty: Number(li.quantity),
    })),
  }));

  const modelProvider = process.env.AI_MODEL_PROVIDER || 'groq';
  const apiKey = modelProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
  if (!apiKey) return { examples: simplifiedList.slice(0, 15), usage: null };

  const openai = new OpenAI({
    apiKey,
    baseURL: modelProvider === 'openai' ? undefined : 'https://api.groq.com/openai/v1',
  });

  try {
    const response = await openai.chat.completions.create({
      model: modelProvider === 'openai' ? 'gpt-4o' : 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a Data Curator. Analyze the user's transaction history.
Select the top 15-20 distinct transaction patterns that best teach how this user categorizes money.
Rules:
- Include common items.
- MUST include rare/complex items if present.
- If multiple transactions look similar, only keep the most recent 1.
- Return valid JSON: { "examples": [...] }`,
        },
        { role: 'user', content: JSON.stringify(simplifiedList) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = JSON.parse(response.choices[0].message.content || '{}');
    const curatedExamples = content.examples || content.patterns || simplifiedList.slice(0, 15);

    await redis.setex(CACHE_KEY, 172800, JSON.stringify(curatedExamples));
    
    const usage: TokenUsage | null = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
    } : null;
    
    return { examples: curatedExamples, usage };
  } catch (e) {
    return { examples: simplifiedList.slice(0, 15), usage: null };
  }
}

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

type UserContext = {
  accounts: { id: string; name: string; type: string }[];
  assets: { id: string; name: string; type: string }[];
};

async function getUserContext(userId: string): Promise<{ context: UserContext; fromCache: boolean }> {
  const CACHE_KEY = `user_context_v1:${userId}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return { context: JSON.parse(cached) as UserContext, fromCache: true };

  const [accounts, assets] = await Promise.all([
    prisma.account.findMany({
      where: { user_id: userId },
      select: { id: true, name: true, type: true },
    }),
    prisma.asset.findMany({
      where: { user_id: userId },
      select: { id: true, name: true, type: true },
    }),
  ]);

  const context: UserContext = { accounts, assets };
  // Cache for 24 hours (accounts/assets don't change frequently)
  await redis.setex(CACHE_KEY, 86400, JSON.stringify(context));
  
  return { context, fromCache: false };
}

// Create a digest of context to detect changes
function createContextDigest(data: any): string {
  return JSON.stringify(data).substring(0, 100);
}

// Check if context has changed and needs to be resent
async function shouldSendFullContext(
  userId: string,
  accounts: UserContext['accounts'],
  assets: UserContext['assets'],
  examples: any[]
): Promise<{ sendFull: boolean; isFirstRequest: boolean }> {
  const CONTEXT_KEY = `ai_conversation_context:${userId}`;
  const cached = await redis.get(CONTEXT_KEY);
  
  const currentDigests = {
    accountsDigest: createContextDigest(accounts),
    assetsDigest: createContextDigest(assets),
    patternsDigest: createContextDigest(examples),
  };
  
  if (!cached) {
    // First request - send full context and cache digests
    const context: ConversationContext = {
      timestamp: Date.now(),
      ...currentDigests,
    };
    await redis.setex(CONTEXT_KEY, 3600, JSON.stringify(context)); // 1 hour TTL
    return { sendFull: true, isFirstRequest: true };
  }
  
  const cachedContext = JSON.parse(cached) as ConversationContext;
  
  // Check if context has changed
  const contextChanged =
    cachedContext.accountsDigest !== currentDigests.accountsDigest ||
    cachedContext.assetsDigest !== currentDigests.assetsDigest ||
    cachedContext.patternsDigest !== currentDigests.patternsDigest;
  
  if (contextChanged) {
    // Context changed - resend full context
    const context: ConversationContext = {
      timestamp: Date.now(),
      ...currentDigests,
    };
    await redis.setex(CONTEXT_KEY, 3600, JSON.stringify(context));
    return { sendFull: true, isFirstRequest: false };
  }
  
  // Context unchanged - use minimal prompt
  // Update timestamp to keep session alive
  cachedContext.timestamp = Date.now();
  await redis.setex(CONTEXT_KEY, 3600, JSON.stringify(cachedContext));
  return { sendFull: false, isFirstRequest: false };
}

export async function parse_transaction_with_ai(input: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  const modelProvider = process.env.AI_MODEL_PROVIDER || 'groq';
  const apiKey = modelProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(`${modelProvider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'} not configured`);
  }

  try {
    const [smartExamplesData, userContextData] = await Promise.all([
      getSmartExamples(user.id),
      getUserContext(user.id),
    ]);

    const examples = smartExamplesData.examples;
    const { accounts, assets } = userContextData.context;
    const contextFromCache = userContextData.fromCache;
    const patternCurationUsage = smartExamplesData.usage;

    // Check if we should send full context or use minimal prompt
    const { sendFull: sendFullContext, isFirstRequest } = await shouldSendFullContext(
      user.id,
      accounts,
      assets,
      examples
    );

    const currentTimeIST = formatInTimeZone(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
    
    let systemPrompt: string;
    
    if (sendFullContext) {
      // Full context prompt (first request or context changed)
      systemPrompt = `You are a ledger assistant. Parse the input into line items.

ACCOUNTS:
${accounts.map(a => `- ${a.name} (${a.type})`).join('\n')}

ASSETS:
${assets.map(a => `- ${a.name}`).join('\n')}

LEARNED USER PATTERNS:
${JSON.stringify(examples, null, 2)}

OUTPUT FORMAT (JSON ONLY):
{
  "date": "ISO 8601 string in IST timezone (Asia/Kolkata, UTC+05:30)",
  "description": "Short description" | null,
  "line_items": [
    { 
      "account_name": "Exact Name from list above", 
      "asset_name": "Exact Name from list above", 
      "quantity": number, 
      "description": "optional details" | null
    }
  ]
}

CRITICAL RULES:
1. Double-entry bookkeeping: For each asset, sum of quantities in real accounts MUST equal sum in nominal and allocation accounts
2. Same rule applies for book_value
3. MUST include line items from ALL THREE account types (real, nominal, allocation) to balance the transaction
4. Only add line item descriptions when the user explicitly provides details for specific items
5. Keep line items minimal unless user specifies otherwise

EXAMPLE: "breakfast 50rs" should create 3 line items:
- real account (e.g., Cash -50)
- nominal account (e.g., Expenses +50)
- allocation account (e.g., Living Expenses +50)

IMPORTANT: The user is in IST timezone (Asia/Kolkata, UTC+05:30).
When the user mentions a time like "10 am" or "3:30 pm", interpret it as IST time.
Current Time in IST: ${currentTimeIST}
Current Date in IST: ${formatInTimeZone(new Date(), 'Asia/Kolkata', 'EEEE, MMMM d, yyyy')}

Remember this context for future requests in this session.`;
    } else {
      // Optimized context prompt (subsequent requests in same session)
      // Still need to provide account/asset lists but in compact format
      systemPrompt = `You are a ledger assistant. Parse the input into line items.

ACCOUNTS: ${accounts.map(a => `${a.name}(${a.type})`).join(', ')}
ASSETS: ${assets.map(a => a.name).join(', ')}

OUTPUT FORMAT (JSON ONLY):
{
  "date": "ISO 8601 string in IST timezone (Asia/Kolkata, UTC+05:30)",
  "description": "Short description" | null,
  "line_items": [
    { 
      "account_name": "Exact Name from list above", 
      "asset_name": "Exact Name from list above", 
      "quantity": number, 
      "description": "optional details" | null
    }
  ]
}

CRITICAL RULES:
1. Double-entry: For each asset, sum of quantities in real accounts = sum in nominal/allocation accounts
2. Same for book_value
3. MUST include line items from ALL THREE account types (real, nominal, allocation) to balance the transaction
4. Only add line item descriptions when user explicitly provides details
5. Keep line items minimal

EXAMPLE: "breakfast 50rs" should create 3 line items:
- real account (e.g., Cash -50)
- nominal account (e.g., Expenses +50)
- allocation account (e.g., Living Expenses +50)

Current Time in IST: ${currentTimeIST}
Current Date in IST: ${formatInTimeZone(new Date(), 'Asia/Kolkata', 'EEEE, MMMM d, yyyy')}`;
    }

    const openai = new OpenAI({
      apiKey,
      baseURL: modelProvider === 'openai' ? undefined : 'https://api.groq.com/openai/v1',
    });

    const response = await openai.chat.completions.create({
      model: modelProvider === 'openai' ? 'gpt-4o' : 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

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
        book_value: asset.type === 'rupees' ? null : quantity,
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

    const parsingUsage: TokenUsage | null = response.usage ? {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
    } : null;

    return {
      success: true,
      message: 'Parsed successfully',
      transaction: {
        description: aiResponse.description,
        date: aiResponse.date,
        line_items: resolvedLineItems,
      },
      usage: {
        patternCuration: patternCurationUsage,
        transactionParsing: parsingUsage,
        contextFromCache,
        fullContextSent: sendFullContext,
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
