'use client'

import type { Prisma } from '@/generated/prisma/client'
import { useState } from 'react'
import { HierarchyTree } from '../_components/HierarchyTree'
import { PageHeader } from '../_components/PageHeader'
import { TotalCard } from '../_components/TotalCard'
import { EmptyState } from '../_components/EmptyState'
import { AssetEmptyIcon } from '../_components/EmptyStateIcons'
import { currency_fmt } from '../_utils/currency_formatter'

type Props = {
  assets: Prisma.assetGetPayload<{ include: { parent: true } }>[]
  totals: Map<string, number>
  assetAccountQuantities: Map<string, Map<string, number>>
  grand_total: number
  xirrByAsset: Map<string, number | null>
}

export default function ClientPage({ assets, totals, assetAccountQuantities, grand_total, xirrByAsset }: Props) {
  const [expandAll, setExpandAll] = useState(true)
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
            scope="asset"
            accentBorderClass="border-l-purple-500"
            reorderEnabled={reorderEnabled}
            onReorderToggle={setReorderEnabled}
            renderExtraInfo={asset => {
              if (asset.type === 'rupees') return null
              const accQty = assetAccountQuantities.get(asset.id) ?? new Map<string, number>()
              const qty = accQty.values().reduce((sum, q) => sum + q, 0)
              const xirr = xirrByAsset.get(asset.id) ?? null
              return (
                <span className="flex items-center gap-3 text-sm text-slate-600">
                  <span>{qty} units</span>
                  {xirr !== null && (
                    <span className={xirr > 0 ? 'text-green-600 font-medium' : xirr < 0 ? 'text-red-600 font-medium' : 'text-slate-600'}>
                      {(xirr * 100).toFixed(2)}% XIRR
                    </span>
                  )}
                </span>
              )
            }}
          />
        </div>
      ) : (
        <EmptyState
          icon={<AssetEmptyIcon />}
          title="No assets yet"
          description="Get started by creating your first asset"
          actionUrl="/assets/create"
          actionLabel="Create Asset"
        />
      )}
    </div>
  )
}
