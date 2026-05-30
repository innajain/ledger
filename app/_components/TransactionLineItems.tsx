'use client'

import React from 'react'
import { asset_type } from '@/generated/prisma/enums'

export type LineItemData = {
  accounting_head_id: string
  asset_id: string
  quantity: string | null
  txn_value: string | null
  description: string
  datetime: string
}

type Account = { id: string; name: string; type: string }
type Asset = { id: string; name: string; type: asset_type }

type ItemGroup = { item: LineItemData; idx: number }

const accountTypeConfig = {
  account: {
    title: 'Real Accounts',
    color: 'green',
  },
  allocation: {
    title: 'Allocation Accounts',
    color: 'orange',
  },
  income_expense: {
    title: 'Nominal Accounts',
    color: 'purple',
  },
}

const colorClasses = {
  green: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
  orange: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-100',
  purple: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-100',
}

type TransactionLineItemsProps = {
  items: LineItemData[]
  // Read-only rows (e.g. the mirrored lines on an approval) — rendered inside
  // the sections in the same card layout, but disabled and non-removable.
  lockedItems?: LineItemData[]
  accounts: Account[]
  assets: Asset[]
  onAddItem: (typeKey: string) => void
  onRemoveItem: (idx: number) => void
  onUpdateItem: (idx: number, field: keyof LineItemData, value: string | null) => void
}

export function TransactionLineItems({
  items,
  lockedItems = [],
  accounts,
  assets,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
}: TransactionLineItemsProps) {
  const sortedAccounts = [...accounts].sort((a, b) => a.name.localeCompare(b.name))
  const sortedAssets = [...assets].sort((a, b) => a.name.localeCompare(b.name))
  // Group items by account type
  const groups: Record<string, ItemGroup[]> = {
    account: [],
    allocation: [],
    income_expense: [],
  }
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    const acc = accounts.find(a => a.id === it.accounting_head_id)
    const t = acc?.type ?? 'account'
    groups[t] = groups[t] || []
    groups[t].push({ item: it, idx })
  }

  const lockedGroups: Record<string, LineItemData[]> = { account: [], allocation: [], income_expense: [] }
  for (const it of lockedItems) {
    const acc = accounts.find(a => a.id === it.accounting_head_id)
    const t = acc?.type ?? 'account'
    ;(lockedGroups[t] ||= []).push(it)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Line Items</h2>
      </div>

      {(['account', 'allocation', 'income_expense'] as const).map(typeKey => {
        const list = groups[typeKey] || []
        const config = accountTypeConfig[typeKey]

        return (
          <div
            key={typeKey}
            className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors"
          >
            <div className={`px-6 py-3 border-b ${colorClasses[config.color as keyof typeof colorClasses]}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{config.title}</h3>
                <button
                  type="button"
                  onClick={() => onAddItem(typeKey)}
                  className="inline-flex items-center gap-2 px-2 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {(lockedGroups[typeKey] || []).map((it, i) => (
                <LineItemCard
                  key={`locked-${i}`}
                  item={it}
                  idx={-1}
                  typeKey={typeKey}
                  accounts={sortedAccounts}
                  assets={sortedAssets}
                  asset={assets.find(a => a.id === it.asset_id)}
                  onUpdateItem={() => {}}
                  onRemoveItem={() => {}}
                  locked
                />
              ))}
              {list.length === 0 && (lockedGroups[typeKey] || []).length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400 italic">No items in this section. Use Add to create one.</div>
              )}
              {list.length > 0 &&
                list.map(({ item: it, idx }) => {
                  const asset = assets.find(a => a.id === it.asset_id)
                  return (
                    <LineItemCard
                      key={idx}
                      item={it}
                      idx={idx}
                      typeKey={typeKey}
                      accounts={sortedAccounts}
                      assets={sortedAssets}
                      asset={asset}
                      onUpdateItem={onUpdateItem}
                      onRemoveItem={onRemoveItem}
                    />
                  )
                })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type LineItemCardProps = {
  item: LineItemData
  idx: number
  typeKey: string
  accounts: Account[]
  assets: Asset[]
  asset: Asset | undefined
  onUpdateItem: (idx: number, field: keyof LineItemData, value: string | null) => void
  onRemoveItem: (idx: number) => void
  locked?: boolean
}

function LineItemCard({ item, idx, typeKey, accounts, assets, asset, onUpdateItem, onRemoveItem, locked = false }: LineItemCardProps) {
  const fieldCls =
    'w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800'
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'
  return (
    <div
      className={`bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border ${locked ? 'border-slate-300 dark:border-slate-500' : 'border-slate-200 dark:border-slate-600'}`}
    >
      {locked && (
        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Mirrored from the request — locked
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className={labelCls}>Account</label>
          <select
            value={item.accounting_head_id}
            onChange={e => onUpdateItem(idx, 'accounting_head_id', e.target.value)}
            disabled={locked}
            className={fieldCls}
          >
            {accounts
              .filter(a => a.type === typeKey)
              .map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Asset</label>
          <select value={item.asset_id} onChange={e => onUpdateItem(idx, 'asset_id', e.target.value)} disabled={locked} className={fieldCls}>
            {assets.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Quantity</label>
          <input
            type="number"
            step="any"
            value={item.quantity ?? ''}
            onChange={e => onUpdateItem(idx, 'quantity', e.target.value === '' ? null : e.target.value)}
            disabled={locked}
            className={fieldCls}
          />
        </div>

        {!(asset?.type === asset_type.rupees) && (
          <div>
            <label className={labelCls}>Txn Value</label>
            <input
              type="number"
              step="any"
              placeholder="Book value"
              value={item.txn_value ?? ''}
              onChange={e => onUpdateItem(idx, 'txn_value', e.target.value === '' ? null : e.target.value)}
              disabled={locked}
              className={fieldCls}
            />
          </div>
        )}
        <div>
          <label className={labelCls}>Line Item Description</label>
          <input
            type="text"
            value={item.description}
            onChange={e => onUpdateItem(idx, 'description', e.target.value)}
            placeholder="Optional description for this line item"
            disabled={locked}
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Line Item Date & Time</label>
          <input
            type="datetime-local"
            value={item.datetime}
            onChange={e => onUpdateItem(idx, 'datetime', e.target.value)}
            placeholder="Optional datetime for this line item"
            disabled={locked}
            className={fieldCls}
          />
        </div>
      </div>

      {!locked && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onRemoveItem(idx)}
            className="inline-flex items-center gap-1 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
