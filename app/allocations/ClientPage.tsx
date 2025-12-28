'use client';

import type { Prisma } from '@/generated/prisma/client';
import { useState } from 'react';
import { HierarchyTree } from '../_components/HeirarchyTree';
import { PageHeader } from '../_components/PageHeader';
import { TotalCard } from '../_components/TotalCard';
import { EmptyState } from '../_components/EmptyState';
import { currency_fmt } from '../_utils/currency formatter';

type Props = {
  allocations: (Prisma.accountGetPayload<{ include: { parent: true } }> & {
    line_items: (Omit<Prisma.line_itemGetPayload<{ include: { asset: true } }>, 'quantity' | 'book_value'> & {
      quantity: number;
      book_value: number | null;
    })[];
  })[];
  totals: Record<string, number>;
  assetQuantities: Record<string, Record<string, number>>;
  grand_total: number;
};

export default function ClientPage({ allocations, totals, assetQuantities, grand_total }: Props) {
  const [expandAll, setExpandAll] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Allocations"
        description="Manage your allocations and view their hierarchy"
        createUrl="/allocations/create"
        createLabel="+ New Allocation"
      />

      <TotalCard
        title="Total Allocations Value"
        total={currency_fmt.format(grand_total)}
        colorScheme="orange"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
        }
      />

      {allocations.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Allocation Hierarchy</h2>
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          <HierarchyTree
            items={allocations}
            totals={totals}
            formatCurrency={amount => currency_fmt.format(amount)}
            getItemUrl={id => `/allocations/${id}`}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          }
          title="No allocations yet"
          description="Get started by creating your first allocation"
          actionUrl="/allocations/create"
          actionLabel="Create Allocation"
        />
      )}
    </div>
  );
}
