'use client'

import type { Prisma } from '@/generated/prisma/client'
import { useState } from 'react'
import { HierarchyTree, useHideEmpty } from '../_components/HierarchyTree'
import { PageHeader } from '../_components/PageHeader'
import { EmptyState } from '../_components/EmptyState'
import { AssetEmptyIcon } from '../_components/EmptyStateIcons'

type Props = {
  assets: Prisma.assetGetPayload<{ include: { parent: true } }>[]
  totals: Map<string, number>
  assetAccountQuantities: Map<string, Map<string, number>>
  xirrByAsset: Map<string, number | null>
  isAdmin: boolean
}

export default function ClientPage({ assets, totals, assetAccountQuantities, xirrByAsset, isAdmin }: Props) {
  const [expandAll, setExpandAll] = useState(true)
  const [reorderEnabled, setReorderEnabled] = useState(false)
  const { hideZero, toggleHideZero } = useHideEmpty()
  const [hiddenCount, setHiddenCount] = useState(0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description={isAdmin ? 'Manage your assets and view their hierarchy' : 'View the asset hierarchy'}
        createUrl={isAdmin ? '/assets/create' : undefined}
        createLabel={isAdmin ? '+ New Asset' : undefined}
      />
      {assets.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Asset Hierarchy</h2>
            <div className="flex items-center gap-2 sm:gap-3">
              {hideZero && hiddenCount > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400" title="Assets whose total (including everything under them) is zero">
                  {hiddenCount} empty hidden
                </span>
              )}
              <button
                onClick={toggleHideZero}
                className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                {hideZero ? 'Show empty' : 'Hide empty'}
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
            items={assets}
            totals={totals}
            getItemUrl={id => `/assets/${id}`}
            expandAll={expandAll}
            hideZero={hideZero}
            onHiddenCountChange={setHiddenCount}
            scope="asset"
            accentBorderClass="border-l-purple-500"
            reorderEnabled={reorderEnabled}
            onReorderToggle={isAdmin ? setReorderEnabled : undefined}
            renderExtraInfo={asset => {
              if (asset.type === 'rupees') return null
              const accQty = assetAccountQuantities.get(asset.id) ?? new Map<string, number>()
              const qty = accQty.values().reduce((sum, q) => sum + q, 0)
              const xirr = xirrByAsset.get(asset.id) ?? null
              return (
                <span className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                  <span>{qty} units</span>
                  {xirr !== null && (
                    <span
                      className={
                        xirr > 0
                          ? 'text-green-600 dark:text-green-400 font-medium'
                          : xirr < 0
                            ? 'text-red-600 dark:text-red-400 font-medium'
                            : 'text-slate-600 dark:text-slate-400'
                      }
                    >
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
          description={isAdmin ? 'Get started by creating your first asset' : 'No assets have been set up yet'}
          actionUrl={isAdmin ? '/assets/create' : undefined}
          actionLabel={isAdmin ? 'Create Asset' : undefined}
        />
      )}
    </div>
  )
}
