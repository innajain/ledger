'use client'

import { AccountDetailPage, AccountData } from '@/app/_components/AccountDetailPage'
import { asset_type } from '@/generated/prisma/enums'
import type { ValuePoint } from '@/app/_components/ValueChart'

type LineItem = {
  id: string
  asset_id?: string
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

type AllocationForClient = {
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
    asset_type: asset_type
    quantity: number
    book_value: number | null
    current_value: number
  }[]
  line_items: LineItem[]
  value_timeseries?: ValuePoint[]
}

const allocationDetailConfig = {
  backLink: '/allocations',
  backText: 'Allocations',
  entityName: 'Allocation',
}

export default function ClientPage({ allocation }: { allocation: AllocationForClient }) {
  const accountData: AccountData = {
    ...allocation,
    breakdown: allocation.breakdown.map(b => ({
      ...b,
      asset_type: b.asset_type,
    })),
    line_items: allocation.line_items,
    value_timeseries: allocation.value_timeseries,
  }

  return <AccountDetailPage account={accountData} config={allocationDetailConfig} />
}
