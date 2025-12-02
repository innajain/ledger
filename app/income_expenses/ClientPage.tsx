'use client';

import React from 'react';
import type { Prisma } from '@/generated/prisma/client';
import { currency_fmt } from '../_utils/currency formatter';
import { HierarchyTree } from '../_components/HeirarchyTree';
import { PageHeader } from '../_components/PageHeader';
import { TotalCard } from '../_components/TotalCard';
import { EmptyState } from '../_components/EmptyState';

type Props = {
  accounts: (Prisma.accountGetPayload<{ include: { parent: true } }> & {
    line_items: (Omit<Prisma.line_itemGetPayload<{ include: { asset: true } }>, 'quantity' | 'book_value'> & {
      quantity: number;
      book_value: number | null;
    })[];
  })[];
  totals: Record<string, number>;
  grand_total: number;
};

export default function ClientPage({ accounts, totals, grand_total }: Props) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Income & Expense"
        description="Manage your nominal accounts (income / expense)"
        createUrl="/income_expenses/create"
        createLabel="+ New Nominal Account"
      />

      <TotalCard
        title="Total Nominal Accounts Value"
        total={currency_fmt.format(grand_total)}
        colorScheme="blue"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2-2 4 4M7 10l5-5 5 5" />
          </svg>
        }
      />

      {accounts.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Nominal Account Hierarchy</h2>
          <HierarchyTree
            items={accounts}
            totals={totals}
            formatCurrency={amount => currency_fmt.format(amount)}
            getItemUrl={id => `/income_expenses/${id}`}
          />
        </div>
      ) : (
        <EmptyState
          icon={<svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>}
          title="No nominal accounts yet"
          description="Create income and expense accounts to track your P&L"
          actionUrl="/income_expenses/create"
          actionLabel="Create Nominal Account"
        />
      )}
    </div>
  );
}
