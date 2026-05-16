'use client'

import { AccountDetailPage, type AccountData } from '@/app/_components/AccountDetailPage'

const config = { backLink: '/accounts', backText: 'Accounts', entityName: 'Account' }

export default function ClientPage({ account }: { account: AccountData }) {
  return <AccountDetailPage account={account} config={config} />
}
