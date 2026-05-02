'use client'

import type { Prisma } from '@/generated/prisma/client'
import { useState } from 'react'
import { HierarchyTree } from '../_components/HierarchyTree'
import { PageHeader } from '../_components/PageHeader'
import { TotalCard } from '../_components/TotalCard'
import { EmptyState } from '../_components/EmptyState'
import { currency_fmt } from '../_utils/currency_formatter'

type Props = {
  assets: Prisma.assetGetPayload<{ include: { parent: true } }>[]
  totals: Map<string, number>
  assetAccountQuantities: Map<string, Map<string, number>>
  grand_total: number
}

export default function ClientPage({ assets, totals, assetAccountQuantities, grand_total }: Props) {
  const [expandAll, setExpandAll] = useState(false)
  const [reorderEnabled, setReorderEnabled] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" description="Manage your assets and view their hierarchy" createUrl="/assets/create" createLabel="+ New Asset" />
      {assets.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Asset Hierarchy</h2>
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="px-3 py-1 text-sm bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors font-medium"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          <HierarchyTree
            items={assets}
            totals={totals}
            getItemUrl={id => `/assets/${id}`}
            expandAll={expandAll}
            storageKey="assets"
            reorderEnabled={reorderEnabled}
            onReorderToggle={setReorderEnabled}
            renderExtraInfo={asset => {
              if (asset.type === 'rupees') return null
              const accQty = assetAccountQuantities.get(asset.id) ?? new Map<string, number>()
              const qty = accQty.values().reduce((sum, q) => sum + q, 0)
              return <span className="text-sm text-slate-600">{qty} units</span>
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
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          }
          title="No assets yet"
          description="Get started by creating your first asset"
          actionUrl="/assets/create"
          actionLabel="Create Asset"
        />
      )}
    </div>
  )
}
