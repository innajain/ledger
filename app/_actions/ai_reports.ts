'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { query_ai } from '@/app/_utils/ai_helper';

type ReportType = 'monthly_summary' | 'spending_analysis' | 'allocation_report' | 'income_expense';

export async function generate_financial_report(type: ReportType, options?: { month?: string; year?: string }) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // Determine date range
    let startDate: Date;
    let endDate: Date;

    if (options?.month && options?.year) {
      const year = parseInt(options.year);
      const month = parseInt(options.month) - 1;
      startDate = new Date(year, month, 1);
      endDate = new Date(year, month + 1, 0);
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Fetch data based on report type
    const transactions = await prisma.transaction.findMany({
      where: {
        line_items: {
          some: {
            account: { user_id: user.id },
          },
        },
        date: {
          gte: startDate,
          lte: endDate,
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
    });

    const accounts = await prisma.account.findMany({
      where: { user_id: user.id },
      include: {
        line_items: {
          where: {
            transaction: {
              date: {
                gte: startDate,
                lte: endDate,
              },
            },
          },
          include: {
            asset: true,
          },
        },
      },
    });

    // Calculate statistics
    const stats = calculateStatistics(transactions, accounts);

    // Generate AI report
    let systemPrompt = '';
    let userPrompt = '';

    switch (type) {
      case 'monthly_summary':
        systemPrompt = `You are a financial report writer. Create a comprehensive monthly financial summary report.
Write in a clear, professional, yet friendly tone. Use sections, bullet points, and formatting.
Include key metrics, trends, and actionable insights.`;
        userPrompt = `Generate a monthly summary report for ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

Statistics:
- Total Transactions: ${stats.totalTransactions}
- Total Income: ₹${stats.totalIncome.toFixed(2)}
- Total Expenses: ₹${stats.totalExpenses.toFixed(2)}
- Net Cash Flow: ₹${stats.netCashFlow.toFixed(2)}
- Top Expense Categories: ${stats.topExpenses.join(', ')}
- Top Income Sources: ${stats.topIncome.join(', ')}

Transactions Summary:
${stats.transactionSummary}`;
        break;

      case 'spending_analysis':
        systemPrompt = `You are a financial analyst specializing in spending pattern analysis.
Create a detailed spending analysis report with insights, patterns, and recommendations.`;
        userPrompt = `Analyze spending patterns for ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

Spending Data:
- Total Expenses: ₹${stats.totalExpenses.toFixed(2)}
- Number of Expense Transactions: ${stats.expenseTransactions}
- Average Transaction Value: ₹${stats.avgExpenseTransaction.toFixed(2)}
- Expense Categories: ${stats.expenseCategories.join(', ')}
- Top 5 Expenses: ${stats.topExpenses.join(', ')}

Compare with typical spending patterns and provide insights.`;
        break;

      case 'allocation_report':
        systemPrompt = `You are a portfolio allocation analyst.
Create a report analyzing the user's financial allocations and providing recommendations.`;
        userPrompt = `Analyze allocation status for ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

Allocation Data:
- Total Allocated: ₹${stats.totalAllocated.toFixed(2)}
- Allocation Categories: ${stats.allocationAccounts.join(', ')}
- Allocation Distribution: ${stats.allocationDistribution}`;
        break;

      case 'income_expense':
        systemPrompt = `You are a financial advisor creating an income vs expenses analysis report.
Provide a clear comparison, identify trends, and suggest improvements.`;
        userPrompt = `Create an income vs expenses report for ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

Data:
- Total Income: ₹${stats.totalIncome.toFixed(2)}
- Total Expenses: ₹${stats.totalExpenses.toFixed(2)}
- Net Savings: ₹${stats.netCashFlow.toFixed(2)}
- Savings Rate: ${stats.savingsRate.toFixed(1)}%
- Income Sources: ${stats.topIncome.join(', ')}
- Expense Categories: ${stats.topExpenses.join(', ')}`;
        break;
    }

    const result = await query_ai(systemPrompt, userPrompt, {
      temperature: 0.7,
    });

    return result;
  } catch (error) {
    console.error('Generate Report Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}

function calculateStatistics(
  transactions: Array<{
    line_items: Array<{
      account: { name: string; type: string };
      asset: { name: string };
      book_value: number | null;
    }>;
  }>,
  accounts: Array<{
    type: string;
    name: string;
    line_items: Array<{
      book_value: number | null;
    }>;
  }>
) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let expenseTransactions = 0;
  const expenseCategories = new Set<string>();
  const incomeCategories = new Set<string>();
  const expenseByCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();
  const allocationByCategory = new Map<string, number>();

  transactions.forEach(t => {
    t.line_items.forEach(li => {
      if (li.account.type === 'nominal') {
        const value = Number(li.book_value || 0);
        if (value < 0) {
          totalExpenses += Math.abs(value);
          expenseTransactions++;
          expenseCategories.add(li.account.name);
          expenseByCategory.set(
            li.account.name,
            (expenseByCategory.get(li.account.name) || 0) + Math.abs(value)
          );
        } else if (value > 0) {
          totalIncome += value;
          incomeCategories.add(li.account.name);
          incomeByCategory.set(
            li.account.name,
            (incomeByCategory.get(li.account.name) || 0) + value
          );
        }
      }
    });
  });

  const topExpenses = Array.from(expenseByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => `${name} (₹${amount.toFixed(2)})`);

  const topIncome = Array.from(incomeByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => `${name} (₹${amount.toFixed(2)})`);

  const allocationAccounts = accounts
    .filter(a => a.type === 'allocation')
    .map(a => a.name);

  let totalAllocated = 0;
  accounts
    .filter(a => a.type === 'allocation')
    .forEach(a => {
      let total = 0;
      a.line_items.forEach(li => {
        total += Number(li.book_value || 0);
      });
      allocationByCategory.set(a.name, total);
      totalAllocated += total;
    });

  const allocationDistribution = Array.from(allocationByCategory.entries())
    .map(([name, amount]) => `${name}: ₹${amount.toFixed(2)}`)
    .join(', ');

  const netCashFlow = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netCashFlow / totalIncome) * 100 : 0;
  const avgExpenseTransaction = expenseTransactions > 0 ? totalExpenses / expenseTransactions : 0;

  const transactionSummary = transactions
    .slice(0, 10)
    .map(t => `${t.description || 'No description'} - ${new Date(t.date).toLocaleDateString()}`)
    .join(', ');

  return {
    totalTransactions: transactions.length,
    totalIncome,
    totalExpenses,
    netCashFlow,
    savingsRate,
    expenseTransactions,
    avgExpenseTransaction,
    expenseCategories: Array.from(expenseCategories),
    topExpenses,
    topIncome,
    allocationAccounts,
    totalAllocated,
    allocationDistribution,
    transactionSummary,
  };
}
