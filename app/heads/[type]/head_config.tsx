import type { ComponentType } from 'react'
import { accounting_head_type } from '@/generated/prisma/enums'
import { AccountEmptyIcon, AllocationEmptyIcon, IncomeExpenseEmptyIcon } from '@/app/_components/EmptyStateIcons'

// The three head types are the only valid `[type]` segments. The path segment
// is the enum value verbatim, so /heads/account, /heads/allocation,
// /heads/income_expense map 1:1 to accounting_head_type.
export function isHeadType(s: string): s is accounting_head_type {
  return s === 'account' || s === 'allocation' || s === 'income_expense'
}

export const headBasePath = (type: accounting_head_type) => `/heads/${type}`

export type HeadConfig = {
  // List page
  title: string
  listDescription: string
  hierarchyTitle: string
  createLabel: string
  emptyTitle: string
  emptyDescription: string
  emptyActionLabel: string
  emptyIcon: ComponentType
  accentBorderClass: string
  // Income/expense heads don't surface per-asset negative badges on the list.
  showNegativeAssetBadges: boolean
  // Detail / form page
  entityName: string
  backText: string
}

export const HEAD_CONFIG: Record<accounting_head_type, HeadConfig> = {
  account: {
    title: 'Accounts',
    listDescription: 'Manage your accounts and view their hierarchy',
    hierarchyTitle: 'Account Hierarchy',
    createLabel: '+ New Account',
    emptyTitle: 'No accounts yet',
    emptyDescription: 'Get started by creating your first account',
    emptyActionLabel: 'Create Account',
    emptyIcon: AccountEmptyIcon,
    accentBorderClass: 'border-l-emerald-500',
    showNegativeAssetBadges: true,
    entityName: 'Account',
    backText: 'Accounts',
  },
  allocation: {
    title: 'Allocations',
    listDescription: 'Manage your allocations and view their hierarchy',
    hierarchyTitle: 'Allocation Hierarchy',
    createLabel: '+ New Allocation',
    emptyTitle: 'No allocations yet',
    emptyDescription: 'Get started by creating your first allocation',
    emptyActionLabel: 'Create Allocation',
    emptyIcon: AllocationEmptyIcon,
    accentBorderClass: 'border-l-amber-500',
    showNegativeAssetBadges: true,
    entityName: 'Allocation',
    backText: 'Allocations',
  },
  income_expense: {
    title: 'Income & Expenses',
    listDescription: 'Manage your income and expense heads',
    hierarchyTitle: 'Income & Expense Hierarchy',
    createLabel: '+ New Income / Expense',
    emptyTitle: 'No income / expense heads yet',
    emptyDescription: 'Create income and expense heads to track your P&L',
    emptyActionLabel: 'Create Income / Expense',
    emptyIcon: IncomeExpenseEmptyIcon,
    accentBorderClass: 'border-l-violet-500',
    showNegativeAssetBadges: false,
    entityName: 'Income / Expense',
    backText: 'Income & Expenses',
  },
}
