'use client';

import React, { useState } from 'react';
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
  const [expandAll, setExpandAll] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Manage your accounts and view their hierarchy"
        createUrl="/accounts/create"
        createLabel="+ New Account"
      />

      <TotalCard
        title="Total Accounts Value"
        total={currency_fmt.format(grand_total)}
        colorScheme="green"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
        }
      />

      {accounts.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Account Hierarchy</h2>
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          <HierarchyTree
            items={accounts}
            totals={totals}
            formatCurrency={amount => currency_fmt.format(amount)}
            getItemUrl={id => `/accounts/${id}`}
            expandAll={expandAll}
          />
        </div>
      ) : (
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
          }
          title="No accounts yet"
          description="Get started by creating your first account"
          actionUrl="/accounts/create"
          actionLabel="Create Account"
        />
      )}
    </div>
  );
}
