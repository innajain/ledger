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

async function getSmartExamples(userId: string) {
  const CACHE_KEY = `ai_patterns_v2:${userId}`;
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached);

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

  if (rawTransactions.length === 0) return [];

  const simplifiedList = rawTransactions.map(t => ({
    desc: t.description,
    items: t.line_items.map(li => ({
      ac: li.account.name,
      as: li.asset.name,
      qty: Number(li.quantity),
    })),
  }));

  const modelProvider = process.env.AI_MODEL_PROVIDER || 'groq';
  const openai = new OpenAI({
    apiKey: modelProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY,
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
    return curatedExamples;
  } catch (e) {
    return simplifiedList.slice(0, 15);
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

export async function parse_transaction_with_ai(input: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  const modelProvider = process.env.AI_MODEL_PROVIDER || 'groq';
  const apiKey = modelProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(`${modelProvider === 'openai' ? 'OPENAI_API_KEY' : 'GROQ_API_KEY'} not configured`);
  }

  try {
    const [examples, accounts, assets] = await Promise.all([
      getSmartExamples(user.id),
      prisma.account.findMany({
        where: { user_id: user.id },
        select: { id: true, name: true, type: true },
      }),
      prisma.asset.findMany({
        where: { user_id: user.id },
        select: { id: true, name: true, type: true },
      }),
    ]);

    const currentTimeIST = formatInTimeZone(new Date(), 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ssXXX");
    const systemPrompt = `You are a ledger assistant. Parse the input into line items.

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

IMPORTANT: The user is in IST timezone (Asia/Kolkata, UTC+05:30).
When the user mentions a time like "10 am" or "3:30 pm", interpret it as IST time.
Current Time in IST: ${currentTimeIST}
Current Date in IST: ${formatInTimeZone(new Date(), 'Asia/Kolkata', 'EEEE, MMMM d, yyyy')}`;

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
      return { success: false, message: 'AI returned no line items.' };
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
      return { success: false, message: errors.join('\n') };
    }

    return {
      success: true,
      message: 'Parsed successfully',
      transaction: {
        description: aiResponse.description,
        date: aiResponse.date,
        line_items: resolvedLineItems,
      },
    };
  } catch (error) {
    console.error('AI Parse Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to parse transaction',
    };
  }
}
