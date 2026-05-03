'use client'

import { useState } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import { currency_fmt } from '../_utils/currency_formatter'
import { HierarchyTree } from '../_components/HierarchyTree'
import { PageHeader } from '../_components/PageHeader'
import { TotalCard } from '../_components/TotalCard'
import { EmptyState } from '../_components/EmptyState'
import { AccountEmptyIcon } from '../_components/EmptyStateIcons'

type Props = {
  accounts: Prisma.accountGetPayload<{ include: { parent: true } }>[]
  totals: Map<string, number>
  accountAssetQuantities: Map<string, Map<string, number>>
  grand_total: number
}

export default function ClientPage({ accounts, totals, accountAssetQuantities: assetQuantities, grand_total }: Props) {
  const [expandAll, setExpandAll] = useState(false)
  const [reorderEnabled, setReorderEnabled] = useState(false)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Manage your accounts and view their hierarchy"
        createUrl="/accounts/create"
        createLabel="+ New Account"
      />
      {accounts.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Account Hierarchy</h2>
            <button
              onClick={() => setExpandAll(!expandAll)}
              className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              {expandAll ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
          <HierarchyTree
            items={accounts}
            totals={totals}
            getItemUrl={id => `/accounts/${id}`}
            expandAll={expandAll}
            storageKey="accounts"
            reorderEnabled={reorderEnabled}
            onReorderToggle={setReorderEnabled}
            renderExtraInfo={item => {
              const assetQtys = assetQuantities.get(item.id) || new Map<string, number>()
              const negativeAssets = [
                ...new Set(
                  Array.from(assetQtys.entries())
                    .filter(([_, qty]) => qty < 0)
                    .map(([assetId, _]) => assetId),
                ),
              ]
              if (negativeAssets.length === 0) return null
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
              )
            }}
          />
        </div>
      ) : (
        <EmptyState
          icon={<AccountEmptyIcon />}
          title="No accounts yet"
          description="Get started by creating your first account"
          actionUrl="/accounts/create"
          actionLabel="Create Account"
        />
      )}
    </div>
  )
}
