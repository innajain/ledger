'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { CreateLineItemInput } from './transactions';
import { get_ai_learning_context } from './ai_context';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

// Type for the AI response
type AITransactionResponse = {
  date: string; // ISO date string
  description?: string;
  line_items: {
    account_id: string;
    account_name: string;
    account_type: 'real' | 'nominal' | 'allocation';
    asset_id: string;
    asset_name: string;
    asset_type?: string;
    quantity: number | string; // May come as string from JSON
    book_value?: number | null;
    description?: string | null;
  }[];
  reasoning?: string; // Optional explanation from AI
  message?: string; // Optional diagnostic when AI cannot construct a transaction
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
      throw new Error('OPENAI_API_KEY not configured. Please add it to your .env file');
    }

    // Fetch all needed data in parallel
    const [accounts, assets, fullContext] = await Promise.all([
      prisma.account.findMany({
        where: { user_id: user.id },
        select: { id: true, name: true, type: true },
      }),
      prisma.asset.findMany({
        where: { user_id: user.id },
        select: { id: true, name: true, type: true },
      }),
      get_ai_learning_context(),
    ]);

    // System prompt with balancing rules
    const introduction = `You are a financial ledger assistant. Parse user transaction requests into structured ledger entries.
    based on the user prompt, and the context of their existing accounts and assets and recent transactions, give back response which i will give to create_transaction function.`;
    const systemPrompt = `
⚠️ **CRITICAL - READ FIRST - ACCOUNT/ASSET SELECTION RULES:**

You MUST follow these rules STRICTLY or the transaction will be wrong:

1. **ONLY use accounts and assets that actually appear in the "Recent Transactions" section**
   - Do NOT look at the full Accounts/Assets lists
   - Do NOT invent accounts or assets that don't exist in recent transactions
   - If you can't find a perfect match in recent transactions, use your best judgment from accounts/assets that DO appear there

2. **Pattern Analysis (MANDATORY):**
   - Extract which REAL account (payment method) is used for each transaction type
   - Extract which ASSET is paired with each REAL account
   - Extract which ALLOCATION account is used for each expense type
   - REPEAT the same combinations you see in recent transactions

3. **Specific Examples from Your Data:**
   - If you see "SBI Card" + "Refundable Money" + "Groceries" in recent transactions, use the exact same combination
   - If you see "Discretionary Expenses - Daily" used for small purchases, use it again
   - Do NOT use "Money" or "Monthly Expenses" unless they appear in recent transactions

---

**TASK: Parse user transaction request into structured ledger entries**

Based on the user prompt and the context of their existing accounts/assets/recent transactions, construct balanced line items.

**Balancing Rules:**
1. Every transaction must have balanced line items across three account types:
   - REAL accounts (payment methods)
   - ALLOCATION accounts (categories)
   - NOMINAL accounts (income/expenses)

2. For each asset: sum(quantity) in real = sum(quantity) in allocation
3. sum(book_value) in real + nominal = 0
4. sum(book_value) in allocation + nominal = 0
5. Rupees assets: book_value = null
6. Other assets: book_value required

See the create_transaction function's code for understanding the constraints. Reference recent transactions for actual account/asset combinations.

**Descriptions:**
- If applicable, provide descriptions for line items (can be null if not needed)
- Provide transaction description if helpful (can be null)

**Date/Time:**
- Give appropriate date and time for transaction date
- If not specified, use current date-time: ${new Date().toISOString()}
- Seconds should be :00

**RESPONSE FORMAT:**
Return a JSON object with this exact structure:
{
  "date": "ISO date string (e.g., 2025-12-12T10:30:00.000Z)",
  "description": "transaction description (optional)",
  "line_items": [
    {
      "account_id": "ID of the account from the context",
      "account_name": "name of the account (must exist in recent transactions)",
      "account_type": "real/allocation/nominal",
      "asset_id": "ID of the asset from the context",
      "asset_name": "name of the asset (must exist in recent transactions)",
      "asset_type": "rupees/mf/etf/shares/other (optional)",
      "quantity": number,
      "book_value": number or null,
      "description": "optional line item description"
    }
  ]
}

CRITICAL IMPLEMENTATION NOTES:
- account_id and asset_id must be valid IDs from the Recent Transactions section
- If a transaction type hasn't been recorded before, use the CLOSEST similar pattern from recent transactions
- Do NOT use "Money" or "Monthly Expenses" unless explicitly shown in recent transactions
- Default allocation for new expense types: "Discretionary Expenses - Daily" (only if it appears in recent transactions)
- If even the default doesn't appear, pick the most general allocation account you can see in recent transactions


don't give redundant descriptions
`;

    // Initialize OpenAI client with optional base URL for local models
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
    });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `${introduction}\n\n${fullContext}\n\n${systemPrompt}`,
        },
        { role: 'user', content: `${input}` },
      ],
      response_format: { type: 'json_object' },
    });

    const rawContent = response.choices[0].message.content || '{}';

    // Write to log file (preserve newlines in prompt/response)
    try {
      const logDir = path.join(process.cwd(), '.ai_logs');
      await fs.mkdir(logDir, { recursive: true });

      const timestamp = new Date().toISOString();
      const logFile = path.join(logDir, `ai_transaction_${new Date().toISOString().split('T')[0]}.log`);

      const logContent = [
        '',
        '='.repeat(80),
        timestamp,
        '='.repeat(80),
        'INPUT:',
        input,
        '',
        'PROMPT:',
        `${fullContext}\n\n${systemPrompt}`,
        '',
        'RAW RESPONSE:',
        rawContent,
        '',
        'FULL RESPONSE:',
        JSON.stringify(response, null, 2),
        '',
      ].join('\n');

      await fs.appendFile(logFile, logContent, 'utf-8');
    } catch (logError) {
      console.error('Failed to write log:', logError);
    }

    let aiResponse: AITransactionResponse;
    try {
      const parsed = JSON.parse(rawContent);
      // Handle if AI wraps response in a 'transaction' or 'data' key
      aiResponse = parsed.transaction || parsed.data || parsed;
    } catch (parseError) {
      return {
        success: false,
        message: `Failed to parse AI response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
      };
    }

    // If AI cannot build a transaction, surface its message
    if (!aiResponse.line_items || !Array.isArray(aiResponse.line_items)) {
      if (aiResponse.message) {
        return {
          success: false,
          message: aiResponse.message,
        };
      }
      return {
        success: false,
        message: `AI returned invalid response. Please try rephrasing your request.\n\nAI Response: ${JSON.stringify(aiResponse, null, 2)}`,
      };
    }

    const line_items: CreateLineItemInput[] = [];

    for (const li of aiResponse.line_items) {
      // Validate line item has required fields
      if (!li.account_id || !li.asset_id) {
        return {
          success: false,
          message: `AI returned incomplete line item. Missing account_id or asset_id.\n\nAI Response: ${JSON.stringify(aiResponse, null, 2)}`,
        };
      }

      // Convert quantity to number if it's a string
      const quantity = typeof li.quantity === 'string' ? parseFloat(li.quantity) : li.quantity;
      if (isNaN(quantity)) {
        return {
          success: false,
          message: `AI returned invalid quantity: ${li.quantity}`,
        };
      }

      line_items.push({
        account_id: li.account_id,
        asset_id: li.asset_id,
        quantity,
        book_value: li.book_value,
        description: li.description || undefined,
      });
    }

    // Return the parsed transaction for user confirmation (don't create yet)
    return {
      success: true,
      message: 'Transaction ready for confirmation',
      transaction: {
        description: aiResponse.description || undefined,
        date: aiResponse.date,
        line_items: aiResponse.line_items.map(li => ({
          account_name: li.account_name,
          account_type: li.account_type,
          asset_name: li.asset_name,
          asset_type: li.asset_type,
          quantity: typeof li.quantity === 'string' ? parseFloat(li.quantity) : li.quantity,
          book_value: li.book_value ?? null,
          description: li.description ?? undefined,
        })),
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
