'use client'

import { useState } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import type { accounting_head_type } from '@/generated/prisma/enums'
import { HierarchyTree } from '@/app/_components/HierarchyTree'
import { PageHeader } from '@/app/_components/PageHeader'
import { EmptyState } from '@/app/_components/EmptyState'
import { HEAD_CONFIG, headBasePath } from './head_config'

type Props = {
  type: accounting_head_type
  heads: Prisma.accounting_headGetPayload<{ include: { parent: true } }>[]
  totals: Map<string, number>
  // assetId/name → signed quantity, per head. Used to flag negative holdings.
  assetQuantities: Map<string, Map<string, number>>
}

export default function HeadListClient({ type, heads, totals, assetQuantities }: Props) {
  const cfg = HEAD_CONFIG[type]
  const base = headBasePath(type)
  const EmptyIcon = cfg.emptyIcon
  const [expandAll, setExpandAll] = useState(false)
  const [reorderEnabled, setReorderEnabled] = useState(false)

  return (
    <div className="space-y-6">
      <PageHeader title={cfg.title} description={cfg.listDescription} createUrl={`${base}/create`} createLabel={cfg.createLabel} />
      {heads.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{cfg.hierarchyTitle}</h2>
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          <HierarchyTree
            items={heads}
            totals={totals}
            getItemUrl={id => `${base}/${id}`}
            expandAll={expandAll}
            scope="account"
            reorderEnabled={reorderEnabled}
            onReorderToggle={setReorderEnabled}
            accentBorderClass={cfg.accentBorderClass}
            renderExtraInfo={
              cfg.showNegativeAssetBadges || type === 'allocation'
                ? item => {
                    const assetQtys = assetQuantities.get(item.id) || new Map<string, number>()

                    const negativeAssets = cfg.showNegativeAssetBadges
                      ? [
                          ...new Set(
                            Array.from(assetQtys.entries())
                              .filter(([, qty]) => qty < -1e-9)
                              .map(([assetName]) => assetName),
                          ),
                        ]
                      : []

                    let showPositiveMoney = false
                    if (type === 'allocation') {
                      const moneyQty = assetQtys.get('Money') || 0
                      if (moneyQty > 1e-9) {
                        const nameLower = item.name.toLowerCase()
                        if (nameLower !== 'rent' && nameLower !== 'monthly expenses') {
                          // Check if descendant of monthly expenses
                          let isDescendant = false
                          let current = item
                          while (current.parent_id) {
                            const parent = heads.find(h => h.id === current.parent_id)
                            if (!parent) break
                            if (parent.name.toLowerCase() === 'monthly expenses') {
                              isDescendant = true
                              break
                            }
                            current = parent
                          }
                          if (!isDescendant) {
                            showPositiveMoney = true
                          }
                        }
                      }
                    }

                    if (negativeAssets.length === 0 && !showPositiveMoney) return null

                    return (
                      <div className="flex flex-wrap gap-2">
                        {negativeAssets.map((assetName, idx) => (
                          <span
                            key={`neg-${idx}`}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            {assetName}
                          </span>
                        ))}
                        {showPositiveMoney && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                            ● Money
                          </span>
                        )}
                      </div>
                    )
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <EmptyState
          icon={<EmptyIcon />}
          title={cfg.emptyTitle}
          description={cfg.emptyDescription}
          actionUrl={`${base}/create`}
          actionLabel={cfg.emptyActionLabel}
        />
      )}
    </div>
  )
}
