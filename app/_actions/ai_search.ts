'use server';

import { get_current_user } from './auth';
import { prisma } from '@/lib/prisma';
import { query_ai } from '@/app/_utils/ai_helper';

export async function search_transactions_with_ai(naturalQuery: string) {
  const user = await get_current_user();
  if (!user) throw new Error('unauthorized');

  try {
    // Get available accounts and assets for context
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

    const systemPrompt = `You are a search query parser for a financial ledger application. 
Convert natural language search queries into structured search parameters.

Available Accounts:
${accounts.map(a => `- ${a.name} (${a.type})`).join('\n')}

Available Assets:
${assets.map(a => `- ${a.name} (${a.type})`).join('\n')}

Parse the user's query and return JSON with these optional fields:
{
  "search": "text to search in description",
  "dateFrom": "YYYY-MM-DD format",
  "dateTo": "YYYY-MM-DD format",
  "minAmount": number,
  "maxAmount": number,
  "accountIds": ["account_id1", "account_id2"],
  "assetIds": ["asset_id1", "asset_id2"],
  "explanation": "Brief explanation of how you interpreted the query"
}

Examples:
- "groceries last month" -> search for "groceries", dateFrom/dateTo for last month
- "expenses over 1000" -> minAmount: 1000
- "bank transactions" -> accountIds for bank accounts
- "all transactions in July" -> dateFrom/dateTo for July

Current date: ${new Date().toISOString().split('T')[0]}`;

    const result = await query_ai(
      systemPrompt,
      naturalQuery,
      {
        json: true,
        temperature: 0.3,
      }
    );

    if (!result.success) {
      return {
        success: false,
        message: result.message,
      };
    }

    const parsedParams = result.data as {
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      minAmount?: number;
      maxAmount?: number;
      accountIds?: string[];
      assetIds?: string[];
      explanation?: string;
    };

    // Build Prisma query
    const where: Record<string, unknown> = {
      line_items: {
        some: {
          account: { user_id: user.id },
        },
      },
    };

    if (parsedParams.search) {
      where.description = {
        contains: parsedParams.search,
        mode: 'insensitive',
      };
    }

    if (parsedParams.dateFrom || parsedParams.dateTo) {
      where.datetime = {};
      if (parsedParams.dateFrom) {
        (where.datetime as Record<string, unknown>).gte = new Date(parsedParams.dateFrom);
      }
      if (parsedParams.dateTo) {
        (where.datetime as Record<string, unknown>).lte = new Date(parsedParams.dateTo);
      }
    }

    // Account or asset filters
    if ((parsedParams.accountIds && parsedParams.accountIds.length > 0) || (parsedParams.assetIds && parsedParams.assetIds.length > 0)) {
      where.line_items = {
        some: {
          AND: [
            { account: { user_id: user.id } },
            ...(parsedParams.accountIds && parsedParams.accountIds.length > 0
              ? [{ account_id: { in: parsedParams.accountIds } }]
              : []),
            ...(parsedParams.assetIds && parsedParams.assetIds.length > 0
              ? [{ asset_id: { in: parsedParams.assetIds } }]
              : []),
          ],
        },
      };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        line_items: {
          include: {
            account: true,
            asset: true,
          },
        },
      },
      orderBy: { datetime: 'desc' },
      take: 50,
    });

    // Filter by amount if specified (need to calculate per transaction)
    let filteredTransactions = transactions;
    if (parsedParams.minAmount !== undefined || parsedParams.maxAmount !== undefined) {
      filteredTransactions = transactions.filter(t => {
        const total = t.line_items.reduce((sum, li) => {
          return sum + Math.abs(Number(li.book_value || 0));
        }, 0);
        if (parsedParams.minAmount !== undefined && total < parsedParams.minAmount) return false;
        if (parsedParams.maxAmount !== undefined && total > parsedParams.maxAmount) return false;
        return true;
      });
    }

    return {
      success: true,
      message: parsedParams.explanation || 'Search completed',
      data: {
        transactions: filteredTransactions.map(t => ({
          id: t.id,
          date: t.datetime,
          description: t.description,
          line_items: t.line_items.map(li => ({
            account_name: li.account.name,
            asset_name: li.asset.name,
            quantity: Number(li.quantity),
            book_value: Number(li.book_value),
          })),
        })),
        parsedParams,
      },
      usage: result.usage,
    };
  } catch (error) {
    console.error('AI Search Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to search transactions',
    };
  }
}
