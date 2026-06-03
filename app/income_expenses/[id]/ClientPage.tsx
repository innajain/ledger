'use client'

import { AccountDetailPage, type AccountData } from '@/app/_components/AccountDetailPage'

const config = { backLink: '/income_expenses', backText: 'Income & Expenses', entityName: 'Income / Expense' }

export default function ClientPage({ account }: { account: AccountData }) {
  return <AccountDetailPage account={account} config={config} />
}
