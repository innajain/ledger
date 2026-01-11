'use client';

import React, { useState } from 'react';
import type { Prisma } from '@/generated/prisma/client';
import { currency_fmt } from '../_utils/currency formatter';
import { HierarchyTree } from '../_components/HeirarchyTree';
import { PageHeader } from '../_components/PageHeader';
import { TotalCard } from '../_components/TotalCard';
import { EmptyState } from '../_components/EmptyState';
import { useRouter } from 'next/navigation';

type Props = {
  accounts: (Prisma.accountGetPayload<{ include: { parent: true } }> & {
    line_items: (Omit<Prisma.line_itemGetPayload<{ include: { asset: true } }>, 'quantity' | 'book_value'> & {
      quantity: number;
      book_value: number | null;
    })[];
  })[];
  totals: Record<string, number>;
  assetQuantities: Record<string, Record<string, number>>;
  grand_total: number;
  showInactive: boolean;
};

export default function ClientPage({ accounts, totals, assetQuantities, grand_total, showInactive }: Props) {
  const [expandAll, setExpandAll] = useState(false);
  const router = useRouter();

  const toggleShowInactive = () => {
    const newShowInactive = !showInactive;
    router.push(`/accounts${newShowInactive ? '?showInactive=true' : ''}`);
  };

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
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Account Hierarchy</h2>
            <div className="flex gap-2">
              <button
                onClick={toggleShowInactive}
                className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                {showInactive ? 'Hide Inactive' : 'Show Inactive'}
              </button>
              <button
                onClick={() => setExpandAll(!expandAll)}
                className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                {expandAll ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
          </div>
          <HierarchyTree
            items={accounts}
            totals={totals}
            formatCurrency={amount => currency_fmt.format(amount)}
            getItemUrl={id => `/accounts/${id}`}
            expandAll={expandAll}
            renderExtraInfo={(item) => {
              const assetQtys = assetQuantities[item.id] || {};
              const negativeAssets = [...new Set(
                item.line_items
                  .filter(li => assetQtys[li.asset.id] !== undefined && assetQtys[li.asset.id] < 0)
                  .map(li => li.asset.name)
              )];
              if (negativeAssets.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-2">
                  {negativeAssets.map((assetName, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {assetName}
                    </span>
                  ))}
                </div>
              );
            }}
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
