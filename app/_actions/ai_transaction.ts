'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

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

    // Get recent transactions
    const transactions = await prisma.transaction.findMany({
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

    // Get all accounts and assets
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

    // Build examples focusing on common patterns
    const simpleExamples = transactions
      .filter(t => t.line_items.length <= 5)
      .slice(0, 15)
      .map(t => ({
        description: t.description || 'no description',
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
TRANSACTION PATTERNS (from user's actual ledger)
═══════════════════════════════════════════════════════════

1. SIMPLE EXPENSE (3 line items):
   Pattern: "breakfast for 50rs using bhim"
   
   Line items:
   • bhim (real): -50
   • expenses (nominal): -50
   • office_food (allocation): -50
   
   Rule: All three are NEGATIVE. They represent money/budget flowing OUT.

2. TRANSFER (2 line items - ONLY case that balances to zero):
   Pattern: "moved 1000 from sbi to idfc"
   
   Line items:
   • sbi (real): -1000
   • idfc (real): +1000
   
   Rule: Source negative, destination positive. No nominal/allocation needed.

3. EXPENSE WITH CASHBACK (5 line items):
   Pattern: "breakfast 36.5rs using bhim got 2rs cashback in idfc"
   
   Line items:
   • bhim (real): -36.5 (payment)
   • idfc (real): +2 (cashback received)
   • expenses (nominal): -36.5 (total expense)
   • cashbacks (nominal): +2 (cashback income)
   • office_food (allocation): -34.5 (net cost)
   
   Rule: Allocation = payment amount - cashback amount (the net expense)

4. INCOME (3 line items):
   Pattern: "salary 50000 in sbi"
   
   Line items:
   • sbi (real): +50000
   • income (nominal): +50000
   • salary_allocation (allocation): +50000

5. MULTI-ITEM EXPENSE:
   Pattern: "zepto order"
   
   Can have multiple "expenses" line items with descriptions:
   • axis_card (real): -225
   • expenses (nominal): -89, description: "maggie"
   • expenses (nominal): -19, description: "chips"  
   • expenses (nominal): -39, description: "tedhe medhe"
   • expenses (nominal): -46, description: "dal biji"
   • expenses (nominal): -32, description: "oreo"
   • discretionary (allocation): -225

═══════════════════════════════════════════════════════════
REAL EXAMPLES FROM USER'S LEDGER
═══════════════════════════════════════════════════════════

${JSON.stringify(simpleExamples, null, 2)}

═══════════════════════════════════════════════════════════
ACCOUNT NAME MAPPING
═══════════════════════════════════════════════════════════

Payment Method Keywords:
• "gpay", "google pay", "g pay", "upi" → google_pay
• "bhim", "bhim upi" → bhim  
• "sbi card", "credit card" → sbi_card
• "axis card", "supercard", "super card" → axis_card
• "bank", "idfc bank" → idfc
• "sbi", "sbi bank" → sbi
• "kotak" → kotak
• "wallet" → wallet or google_pay
• "cash" → cash_at_flat_wardrobe

Category Keywords:
• "breakfast", "lunch", "snacks" (at/from office) → office_food
• "dinner", "tiffin" → dinner_tiffin
• "auto", "metro", "uber", "rapido", "cab" → commute
• "movie", "entertainment", "outing" → weekend
• "groceries", "shopping", general → discretionary
• "rent" → rent
• "maid", "cleaning" → maid
• "electricity", "wifi", "internet" → electricity, wifi
• "recharge", "mobile" → mobile_recharge

═══════════════════════════════════════════════════════════
IMPORTANT RULES
═══════════════════════════════════════════════════════════

1. Use EXACT account names from the available accounts list
2. Default asset is "money" (unless specifically mentioned)
3. For expenses: real, nominal, allocation are ALL negative
4. For income: real and allocation positive, nominal negative
5. For transfers: ONLY 2 line items, source negative, dest positive
6. Expenses with cashback: 5+ line items following pattern #3
7. Study the examples carefully - match their exact structure
8. For salary, use "unallocated" allocation

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
      baseURL: process.env.OPENAI_BASE_URL,
    });

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.05, // Very low for consistency
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
    const resolvedLineItems: any[] = [];
    const errors: string[] = [];

    for (const li of aiResponse.line_items) {
      // Account matching with fallback
      let account = accounts.find(a => a.name.toLowerCase() === li.account_name.toLowerCase());

      if (!account) {
        const searchLower = li.account_name.toLowerCase();
        const matches = accounts.filter(a => {
          const nameLower = a.name.toLowerCase();
          return nameLower.includes(searchLower) || searchLower.includes(nameLower) || nameLower.split(' ').some(word => searchLower.includes(word));
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

    // Basic structure validation
    const accountTypes = resolvedLineItems.map(li => li.account_type);
    const realCount = accountTypes.filter(t => t === 'real').length;
    const nominalCount = accountTypes.filter(t => t === 'nominal').length;
    const allocationCount = accountTypes.filter(t => t === 'allocation').length;

    // Check if it's a transfer (2 real accounts only)
    if (resolvedLineItems.length === 2 && realCount === 2 && nominalCount === 0 && allocationCount === 0) {
      // Valid transfer
      return {
        success: true,
        message: '✓ Transfer transaction ready',
        transaction: {
          description: aiResponse.description,
          date: aiResponse.date,
          line_items: resolvedLineItems,
        },
      };
    }

    // Check if it's an expense/income (needs at least 1 of each type)
    if (realCount >= 1 && nominalCount >= 1 && allocationCount >= 1) {
      return {
        success: true,
        message: '✓ Transaction ready',
        transaction: {
          description: aiResponse.description,
          date: aiResponse.date,
          line_items: resolvedLineItems,
        },
      };
    }

    // Invalid structure
    return {
      success: false,
      message:
        `⚠️ Invalid structure detected:\n\n` +
        `Real accounts: ${realCount}\n` +
        `Nominal accounts: ${nominalCount}\n` +
        `Allocation accounts: ${allocationCount}\n\n` +
        `Expected:\n` +
        `• For expenses/income: At least 1 of each type\n` +
        `• For transfers: Exactly 2 real accounts, nothing else`,
    };
  } catch (error) {
    console.error('AI transaction error:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Failed to parse transaction'}`,
    };
  }
}
