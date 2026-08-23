'use client'

import type { Prisma } from '@/generated/prisma/client'
import { useState } from 'react'
import { Button } from '@/app/_components/Button'
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
        description={isAdmin ? 'Funds, stocks and everything else you hold.' : 'View the asset hierarchy'}
        createUrl={isAdmin ? '/assets/create' : undefined}
        createLabel={isAdmin ? 'New asset' : undefined}
      />
      {assets.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Asset hierarchy</h2>
            <div className="flex items-center gap-2 sm:gap-3">
              {hideZero && hiddenCount > 0 && (
                <span className="text-xs text-slate-500 dark:text-slate-400" title="Assets whose total (including everything under them) is zero">
                  {hiddenCount} empty hidden
                </span>
              )}
              <Button size="sm" variant="secondary" onClick={toggleHideZero}>
                {hideZero ? 'Show empty' : 'Hide empty'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setExpandAll(!expandAll)}>
                {expandAll ? 'Collapse all' : 'Expand all'}
              </Button>
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
          description={
            isAdmin
              ? 'An asset is anything you hold units of — a mutual fund, a stock, plain rupees. Create one to track it.'
              : 'No assets have been set up yet'
          }
          actionUrl={isAdmin ? '/assets/create' : undefined}
          actionLabel={isAdmin ? 'New asset' : undefined}
        />
      )}
    </div>
  )
}
