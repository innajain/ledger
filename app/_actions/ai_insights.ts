'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { query_ai } from '@/app/_utils/ai_helper';
import { Prisma } from '@/generated/prisma/client';

export async function generate_financial_insights() {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // Fetch user's financial data
    const [accounts, transactions, allocations] = await Promise.all([
      prisma.account.findMany({
        where: { user_id: user.id },
        include: {
          line_items: {
            include: { asset: true },
            orderBy: { transaction: { date: 'desc' } },
            take: 100,
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          line_items: {
            some: {
              account: { user_id: user.id },
            },
          },
        },
        include: {
          line_items: {
            include: {
              account: true,
              asset: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      prisma.account.findMany({
        where: { user_id: user.id, type: 'allocation' },
        include: {
          line_items: {
            include: { asset: true },
          },
        },
      }),
    ]);

    // Calculate summary statistics
    const realAccounts = accounts.filter(a => a.type === 'real');
    const nominalAccounts = accounts.filter(a => a.type === 'nominal');
    
    let totalRealValue = new Prisma.Decimal(0);
    let totalNominalValue = new Prisma.Decimal(0);
    let totalAllocationValue = new Prisma.Decimal(0);

    realAccounts.forEach(acc => {
      acc.line_items.forEach(li => {
        totalRealValue = totalRealValue.add(li.book_value || 0);
      });
    });

    nominalAccounts.forEach(acc => {
      acc.line_items.forEach(li => {
        totalNominalValue = totalNominalValue.add(li.book_value || 0);
      });
    });

    allocations.forEach(acc => {
      acc.line_items.forEach(li => {
        totalAllocationValue = totalAllocationValue.add(li.book_value || 0);
      });
    });

    // Get recent transaction patterns
    const recentExpenseAccounts = new Map<string, number>();
    const recentIncomeAccounts = new Map<string, number>();

    transactions.slice(0, 20).forEach(t => {
      t.line_items.forEach(li => {
        if (li.account.type === 'nominal') {
          const value = Number(li.book_value || 0);
          if (value < 0) {
            const current = recentExpenseAccounts.get(li.account.name) || 0;
            recentExpenseAccounts.set(li.account.name, current + Math.abs(value));
          } else if (value > 0) {
            const current = recentIncomeAccounts.get(li.account.name) || 0;
            recentIncomeAccounts.set(li.account.name, current + value);
          }
        }
      });
    });

    const topExpenses = Array.from(recentExpenseAccounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => `${name}: ₹${amount.toFixed(2)}`);

    const topIncome = Array.from(recentIncomeAccounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amount]) => `${name}: ₹${amount.toFixed(2)}`);

    // Build context for AI
    const financialContext = `
Financial Summary:
- Total Real Account Value: ₹${totalRealValue.toFixed(2)}
- Total Nominal Account Value: ₹${totalNominalValue.toFixed(2)}
- Total Allocation Value: ₹${totalAllocationValue.toFixed(2)}
- Number of Real Accounts: ${realAccounts.length}
- Number of Nominal Accounts: ${nominalAccounts.length}
- Number of Allocation Accounts: ${allocations.length}
- Recent Transactions: ${transactions.length}

Top Expense Categories (last 20 transactions):
${topExpenses.join('\n') || 'No expenses recorded'}

Top Income Sources (last 20 transactions):
${topIncome.join('\n') || 'No income recorded'}

Recent Transaction Descriptions:
${transactions.slice(0, 10).map(t => `- ${t.description || 'No description'} (${new Date(t.date).toLocaleDateString()})`).join('\n')}
`;

    const systemPrompt = `You are a personal finance advisor analyzing a user's financial data from their ledger application. 
The ledger uses a triple-entry bookkeeping system with real accounts (assets/liabilities), nominal accounts (income/expenses), and allocation accounts (budget categories).

Provide 3-5 specific, actionable insights about their financial situation. Focus on:
1. Spending patterns and trends
2. Budget allocation effectiveness
3. Potential savings opportunities
4. Financial health indicators
5. Unusual patterns or concerns

Be concise, friendly, and practical. Format your response as JSON with this structure:
{
  "insights": [
    {
      "title": "Short insight title",
      "description": "Detailed explanation",
      "type": "positive" | "neutral" | "warning",
      "action": "Optional suggested action"
    }
  ],
  "summary": "One-sentence overall financial health assessment"
}`;

    const result = await query_ai(
      systemPrompt,
      financialContext,
      {
        json: true,
        cache_key: `insights:${user.id}`,
        cache_ttl: 3600, // Cache for 1 hour
        temperature: 0.7,
      }
    );

    return result;
  } catch (error) {
    console.error('Generate Insights Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate insights',
    };
  }
}

export async function ask_financial_question(question: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // Fetch necessary context
    const [accounts, recentTransactions] = await Promise.all([
      prisma.account.findMany({
        where: { user_id: user.id },
        include: {
          line_items: {
            include: { asset: true },
            take: 10,
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          line_items: {
            some: {
              account: { user_id: user.id },
            },
          },
        },
        include: {
          line_items: {
            include: {
              account: true,
              asset: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 20,
      }),
    ]);

    const systemPrompt = `You are a helpful financial assistant for a personal ledger application. 
The user has access to their financial data including accounts, transactions, assets, and allocations.
Answer questions about their finances clearly and concisely. If you don't have enough information, say so.

User's Data Context:
Accounts: ${accounts.map(a => `${a.name} (${a.type})`).join(', ')}
Recent Transactions: ${recentTransactions.length} transactions in the last period

Provide helpful, accurate answers based on the available data. If calculations are needed, show your work.`;

    const result = await query_ai(
      systemPrompt,
      question,
      {
        temperature: 0.7,
      }
    );

    return result;
  } catch (error) {
    console.error('Ask Question Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to process question',
    };
  }
}
