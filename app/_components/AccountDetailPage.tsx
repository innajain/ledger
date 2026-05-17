'use client'

import { ViewPageHeader, InfoCard, EmptyState, LineItemRow } from '@/app/_components/ViewPageComponents'
import { HoldingsGrid, HoldingItem } from '@/app/_components/HoldingsGrid'
import { Card } from '@/app/_components/Card'
import { asset_type } from '@/generated/prisma/enums'
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { ValueChart, type ValuePoint } from '@/app/_components/ValueChart'

export type LineItem = {
  id: string
  asset_id?: string
  asset_name: string
  quantity: number
  txn_value: number | null
  current_value: number
  transaction_id: string
  transaction_date: string
  transaction_description: string | null
  line_item_description: string | null
  asset_type: asset_type
  remaining_quantity?: number | null
}

export type AccountData = {
  id: string
  name: string
  total: number
  xirr?: number | null
  breakdown: {
    asset_id: string
    asset_name: string
    asset_type: asset_type
    quantity: number
    txn_value: number | null
    current_value: number
  }[]
  line_items: LineItem[]
  value_timeseries?: ValuePoint[]
}

type AccountDetailConfig = {
  backLink: string
  backText: string
  entityName: string // "Account", "Allocation"
  holdingsTitle?: string
}

type AccountDetailPageProps = {
  account: AccountData
  config: AccountDetailConfig
}

export function AccountDetailPage({ account, config }: AccountDetailPageProps) {
  const holdingsItems: HoldingItem[] = account.breakdown.map(b => ({
    id: b.asset_id,
    name: b.asset_name,
    link: `/assets/${b.asset_id}`,
    asset_type: b.asset_type,
    quantity: b.quantity,
    txn_value: b.txn_value,
    current_value: b.current_value,
  }))

  return (
    <div className="space-y-6">
      <ViewPageHeader
        backLink={config.backLink}
        backText={config.backText}
        title={account.name}
        description={`${config.entityName} details and holdings`}
        editLink={`${config.backLink}/${account.id}/update`}
        editText={`Edit ${config.entityName}`}
      />

      <InfoCard
        title={`${config.entityName} Information`}
        fields={[
          {
            label: 'Total Value',
            value: <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{currency_fmt.format(account.total)}</p>,
          },
          ...(account.xirr !== undefined && account.xirr !== null
            ? [
                {
                  label: 'XIRR',
                  value: (
                    <span
                      className={
                        account.xirr > 0
                          ? 'text-green-600 dark:text-green-400 font-semibold'
                          : account.xirr < 0
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400 font-semibold'
                      }
                    >
                      {(account.xirr * 100).toFixed(2)}%
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      <HoldingsGrid title={config.holdingsTitle || 'Holdings (aggregated by asset)'} items={holdingsItems} linkLabel="View Asset →" />

      {/* Line items section */}
      <Card>
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transaction Line Items</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {account.line_items.length} item
            {account.line_items.length !== 1 ? 's' : ''}
          </p>
        </div>

        {account.line_items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
            {account.line_items.map(li => (
              <LineItemRow
                key={li.id}
                assetName={li.asset_name}
                assetLink={li.asset_id ? `/assets/${li.asset_id}` : undefined}
                quantity={li.quantity}
                bookValue={li.txn_value}
                transactionId={li.transaction_id}
                transactionDate={li.transaction_date}
                transactionDescription={li.transaction_description}
                lineItemDescription={li.line_item_description}
                assetType={li.asset_type}
                remainingQuantity={li.remaining_quantity}
              />
            ))}
          </div>
        )}
      </Card>

      {account.value_timeseries && account.value_timeseries.length > 0 && <ValueChart points={account.value_timeseries} title="Value over time" />}
    </div>
  )
}
