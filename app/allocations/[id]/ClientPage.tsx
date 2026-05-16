'use client'

import { AccountDetailPage, type AccountData } from '@/app/_components/AccountDetailPage'

const config = { backLink: '/allocations', backText: 'Allocations', entityName: 'Allocation' }

export default function ClientPage({ allocation }: { allocation: AccountData }) {
  return <AccountDetailPage account={allocation} config={config} />
}
