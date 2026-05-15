'use client'

import { useState } from 'react'
import type { Prisma } from '@/generated/prisma/client'
import { HierarchyTree } from '../_components/HierarchyTree'
import { PageHeader } from '../_components/PageHeader'
import { EmptyState } from '../_components/EmptyState'
import { NominalAccountEmptyIcon } from '../_components/EmptyStateIcons'

type Props = {
  accounts: Prisma.accountGetPayload<{ include: { parent: true } }>[]
  totals: Map<string, number>
}

export default function ClientPage({ accounts, totals }: Props) {
  const [expandAll, setExpandAll] = useState(false)
  const [reorderEnabled, setReorderEnabled] = useState(false)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Income & Expense"
        description="Manage your nominal accounts (income / expense)"
        createUrl="/income_expenses/create"
        createLabel="+ New Nominal Account"
      />
      {accounts.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nominal Account Hierarchy</h2>
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
            expandAll={expandAll}
            scope="account"
            reorderEnabled={reorderEnabled}
            onReorderToggle={setReorderEnabled}
            getItemUrl={id => `/income_expenses/${id}`}
            accentBorderClass="border-l-violet-500"
          />
        </div>
      ) : (
        <EmptyState
          icon={<NominalAccountEmptyIcon />}
          title="No nominal accounts yet"
          description="Create income and expense accounts to track your P&L"
          actionUrl="/income_expenses/create"
          actionLabel="Create Nominal Account"
        />
      )}
    </div>
  )
}
