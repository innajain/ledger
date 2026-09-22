import type { ComponentType } from 'react'
import { accounting_head_type } from '@/generated/prisma/enums'
import { AccountEmptyIcon, AllocationEmptyIcon, IncomeExpenseEmptyIcon } from '@/app/_components/EmptyStateIcons'

export function isHeadType(s: string): s is accounting_head_type {
  return s === 'account' || s === 'allocation' || s === 'income_expense'
}

export const headBasePath = (type: accounting_head_type) => `/heads/${type}`

export type HeadConfig = {
  title: string
  listDescription: string
  hierarchyTitle: string
  createLabel: string
  emptyTitle: string
  emptyDescription: string
  emptyActionLabel: string
  emptyIcon: ComponentType
  accentBorderClass: string

  showNegativeAssetBadges: boolean

  /**
   * Offer the lifetime / this-FY toggle on the list. Only income & expenses: their
   * lifetime total is a running sum since the ledger began, which answers nothing on
   * its own. An account's or allocation's total is a stock — what is there now — and a
   * period cut of it would read as a balance while meaning something else entirely.
   */
  showPeriodToggle: boolean

  /** Secondary links in the list header — pages derived from these heads. */
  relatedLinks?: { href: string; label: string }[]

  entityName: string
  backText: string
  /** Plural noun for this head type's descendants — "sub-accounts", "sub-categories". */
  subEntityLabel: string
}

export const HEAD_CONFIG: Record<accounting_head_type, HeadConfig> = {
  account: {
    title: 'Accounts',
    listDescription: 'Where your money sits — banks, wallets, people.',
    hierarchyTitle: 'Account hierarchy',
    createLabel: 'New account',
    emptyTitle: 'No accounts yet',
    emptyDescription:
      'An account is anywhere money sits — a bank account, a wallet, a person who owes you. Create one to start posting transactions.',
    emptyActionLabel: 'Create account',
    emptyIcon: AccountEmptyIcon,
    accentBorderClass: 'border-l-emerald-500',
    showNegativeAssetBadges: true,
    showPeriodToggle: false,
    entityName: 'Account',
    backText: 'Accounts',
    subEntityLabel: 'sub-accounts',
  },
  allocation: {
    title: 'Allocations',
    listDescription: 'What your money is parked for — savings, investments, spending buckets.',
    hierarchyTitle: 'Allocation hierarchy',
    createLabel: 'New allocation',
    emptyTitle: 'No allocations yet',
    emptyDescription: 'Allocations answer “what is this money for?” — buckets like Savings or Investments that cut across accounts.',
    emptyActionLabel: 'Create allocation',
    emptyIcon: AllocationEmptyIcon,
    accentBorderClass: 'border-l-amber-500',
    showNegativeAssetBadges: true,
    showPeriodToggle: false,
    entityName: 'Allocation',
    backText: 'Allocations',
    subEntityLabel: 'sub-allocations',
  },
  income_expense: {
    title: 'Income & Expenses',
    listDescription: 'Why money moves — income sources and spending categories.',
    hierarchyTitle: 'Income & Expense hierarchy',
    createLabel: 'New category',
    emptyTitle: 'No categories yet',
    emptyDescription: 'Categories explain why money moved — salary, rent, groceries. They power the income and expense summaries.',
    emptyActionLabel: 'Create category',
    emptyIcon: IncomeExpenseEmptyIcon,
    accentBorderClass: 'border-l-violet-500',
    showNegativeAssetBadges: false,
    showPeriodToggle: true,
    // The tax computation is built entirely from these heads' treatments, so this
    // list is the only sensible place to reach it from.
    relatedLinks: [{ href: '/tax', label: 'Tax' }],
    entityName: 'Income / Expense',
    backText: 'Income & Expenses',
    subEntityLabel: 'sub-categories',
  },
}
