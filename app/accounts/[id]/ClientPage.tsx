'use client'

import { AccountDetailPage, AccountData } from '@/app/_components/AccountDetailPage'
import { asset_type } from '@/generated/prisma/enums'

type LineItem = {
  id: string
  asset_id: string
  asset_name: string
  quantity: number
  book_value: number | null
  current_value: number
  transaction_id: string
  transaction_date: string
  transaction_description: string | null
  line_item_description: string | null
  asset_type: asset_type
}

type AccountForClient = {
  id: string
  name: string
  type: string
  parent: { id: string; name: string } | null
  total: number
  book_value_total: number
  xirr: number | null
  breakdown: {
    asset_id: string
    asset_name: string
    quantity: number
    book_value: number | null
    current_value: number
    asset_type: asset_type
  }[]
  line_items: LineItem[]
}

const accountDetailConfig = {
  backLink: '/accounts',
  backText: 'Back to Accounts',
  entityName: 'Account',
}

export default function ClientPage({ account }: { account: AccountForClient }) {
  const accountData: AccountData = {
    ...account,
    breakdown: account.breakdown.map(b => ({
      ...b,
      asset_type: b.asset_type,
    })),
    line_items: account.line_items,
  }

  return <AccountDetailPage account={accountData} config={accountDetailConfig} />
}
