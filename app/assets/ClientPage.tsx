'use client';

import { Prisma } from '@/generated/prisma/client';
import React from 'react';
import { HierarchyTree } from '../_components/HeirarchyTree';
import { PageHeader } from '../_components/PageHeader';
import { TotalCard } from '../_components/TotalCard';
import { EmptyState } from '../_components/EmptyState';

// Lightweight shapes for client component
type LineItemNumbered = {
  id: string;
  transaction_id: string;
  account_id: string;
  asset_id: string;
  quantity: number;
  book_value: number | null;
  asset: { id: string; name: string };
};

type AssetNumbered = Prisma.assetGetPayload<{ include: { parent: true } }> & { 
  line_items: LineItemNumbered[];
  is_base_currency?: boolean;
};

type Props = {
  assets: AssetNumbered[];
  totals: Record<string, number>;
  grand_total: number;
};

export default function ClientPage({ assets, totals, grand_total }: Props) {
  const currencyFmt = new Intl.NumberFormat('en-IN', { 
    style: 'currency', 
    currency: 'INR', 
    maximumFractionDigits: 2 
  });
  
  const qtyFmt = (n: number) => n.toFixed(2);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Manage your assets and view their hierarchy"
        createUrl="/assets/create"
        createLabel="+ New Asset"
      />

      <TotalCard
        title="Total Assets Value"
        total={currencyFmt.format(grand_total)}
        colorScheme="purple"
        icon={
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        }
      />

      {assets.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Asset Hierarchy</h2>
          <HierarchyTree
            items={assets}
            totals={totals}
            formatCurrency={(amount) => currencyFmt.format(amount)}
            getItemUrl={(id) => `/assets/${id}`}
            renderExtraInfo={(asset) => {
              if (asset.is_base_currency) return null;
              const qty = asset.line_items.reduce((s, li) => s + (li.quantity ?? 0), 0);
              return <span className="text-sm text-slate-600">{qtyFmt(qty)} units</span>;
            }}
          />
        </div>
      ) : (
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
          title="No assets yet"
          description="Get started by creating your first asset"
          actionUrl="/assets/create"
          actionLabel="Create Asset"
        />
      )}
    </div>
  );
}