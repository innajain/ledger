'use client';

import React from 'react';
import type { Prisma } from '@/generated/prisma/client';
import { HierarchyTree } from '../_components/HeirarchyTree';
import { PageHeader } from '../_components/PageHeader';
import { TotalCard } from '../_components/TotalCard';
import { EmptyState } from '../_components/EmptyState';

type Props = {
  allocations: (Prisma.accountGetPayload<{ include: { parent: true } }> & {
    line_items: (Omit<Prisma.line_itemGetPayload<{ include: { asset: true } }>, 'quantity' | 'book_value'> & {
      quantity: number;
      book_value: number | null;
    })[];
  })[];
  totals: Record<string, number>;
  grand_total: number;
};

export default function ClientPage({ allocations, totals, grand_total }: Props) {
  const currencyFmt = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });

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
        total={currencyFmt.format(grand_total)}
        colorScheme="orange"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
        }
      />

      {allocations.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Allocation Hierarchy</h2>
          <HierarchyTree
            items={allocations}
            totals={totals}
            formatCurrency={amount => currencyFmt.format(amount)}
            getItemUrl={id => `/allocations/${id}`}
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
