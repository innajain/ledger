'use client'

import React, { useId, useMemo, useState } from 'react'
import { asset_type } from '@/generated/prisma/enums'
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { asset_type_label } from '@/app/_utils/labels'
import { Combobox } from './Combobox'
import {
  preview_line_items,
  type LineItemPreview,
  type PreviewHeadType,
  type PreviewLine,
  type PreviewLineInput,
} from '@/app/_utils/line_item_preview'

export type LineItemData = {
  /**
   * Client-side identity, used only as the React key. Lines are prepended and spliced, so an
   * index key would hand a card's local state (the collapsed "Custom date" field) to a different
   * line. Stamp one via `new_line_uid()` wherever a line is created.
   */
  uid?: string
  accounting_head_id: string
  asset_id: string
  quantity: string | null
  txn_value: string | null
  description: string
  datetime: string
  // carried through edits invisibly; the form's single Reference field edits
  // the single-account-line case, per-line refs survive round trips
  external_ref?: string | null
}

type Account = { id: string; name: string; type: string; linked?: boolean }
type Asset = { id: string; name: string; type: asset_type }

type ItemGroup = { item: LineItemData; idx: number }

let uid_seq = 0

export function new_line_uid(): string {
  uid_seq += 1
  return `line-${uid_seq}`
}

const headTypeConfig = {
  account: {
    title: 'Accounts',
    color: 'green',
    hint: 'Where the money actually sits. Negative = money out, positive = in.',
  },
  allocation: {
    title: 'Allocations',
    color: 'orange',
    hint: 'Which bucket it belongs to. Leave one line blank and it is worked out for you.',
  },
  income_expense: {
    title: 'Income & Expenses',
    color: 'purple',
    hint: 'Why the money moved. Leave one line blank and it is worked out for you.',
  },
}

// Section identity is a small colored dot, not a full-bleed tinted banner — three loud
// hues on one form outshout the actual data.
const dotClasses = {
  green: 'bg-green-500',
  orange: 'bg-orange-500',
  purple: 'bg-purple-500',
}

const emptyPreviewLine: PreviewLine = { index: -1, is_blank: false, derived_quantity: null, derived_txn_value: null, is_zero: false }

/** en-IN, up to the stored precision — used for unit counts, never for rupees */
const qty_fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 })

function toPreviewInput(item: LineItemData, accounts: Account[], assets: Asset[]): PreviewLineInput {
  const head = accounts.find(a => a.id === item.accounting_head_id)
  const asset = assets.find(a => a.id === item.asset_id)
  // An id we cannot resolve must never be guessed at: silently calling it an account/rupee line
  // would fold it into the wrong group and make every derived remainder in that group wrong while
  // still reporting "this transaction balances". Blanking the id routes it through the
  // incomplete-line path instead, which says so out loud.
  return {
    accounting_head_id: head ? item.accounting_head_id : '',
    head_type: (head?.type as PreviewHeadType) ?? 'account',
    asset_id: asset ? item.asset_id : '',
    asset_type: asset?.type ?? asset_type.rupees,
    quantity: item.quantity,
    txn_value: item.txn_value,
    head_name: head?.name ?? null,
    asset_name: asset?.name ?? null,
  }
}

/**
 * Runs the null-remainder preview over a form's lines. Locked (mirrored) lines
 * come first so their indices are stable, and they count towards the balance
 * even though the user cannot touch them.
 */
export function preview_form_line_items(items: LineItemData[], lockedItems: LineItemData[], accounts: Account[], assets: Asset[]): LineItemPreview {
  return preview_line_items([...lockedItems, ...items].map(it => toPreviewInput(it, accounts, assets)))
}

type TransactionLineItemsProps = {
  items: LineItemData[]

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
  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => a.name.localeCompare(b.name)), [accounts])
  const sortedAssets = useMemo(() => [...assets].sort((a, b) => a.name.localeCompare(b.name)), [assets])

  const preview = useMemo(() => preview_form_line_items(items, lockedItems, accounts, assets), [items, lockedItems, accounts, assets])
  const lockedOffset = lockedItems.length
  const previewFor = (i: number) => preview.lines[i] ?? emptyPreviewLine

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

  const lockedGroups: Record<string, { item: LineItemData; idx: number }[]> = { account: [], allocation: [], income_expense: [] }
  for (let i = 0; i < lockedItems.length; i++) {
    const it = lockedItems[i]
    const acc = accounts.find(a => a.id === it.accounting_head_id)
    const t = acc?.type ?? 'account'
    ;(lockedGroups[t] ||= []).push({ item: it, idx: i })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Line items</h2>
      </div>

      {(['account', 'allocation', 'income_expense'] as const).map(typeKey => {
        const list = groups[typeKey] || []
        const config = headTypeConfig[typeKey]

        return (
          <div
            key={typeKey}
            /* no overflow-hidden: the Combobox dropdowns inside must be able to overhang the card */
            className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 rounded-t-lg bg-slate-50 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${dotClasses[config.color as keyof typeof dotClasses]}`} />
                    {config.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{config.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAddItem(typeKey)}
                  className="shrink-0 inline-flex items-center gap-2 px-2 py-1 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm"
                >
                  <svg aria-hidden="true" className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {(lockedGroups[typeKey] || []).map(({ item: it, idx: lockedIdx }) => (
                <LineItemCard
                  key={`locked-${lockedIdx}`}
                  item={it}
                  idx={-1}
                  typeKey={typeKey}
                  accounts={sortedAccounts}
                  assets={sortedAssets}
                  asset={assets.find(a => a.id === it.asset_id)}
                  preview={previewFor(lockedIdx)}
                  onUpdateItem={() => {}}
                  onRemoveItem={() => {}}
                  locked
                />
              ))}
              {list.length === 0 && (lockedGroups[typeKey] || []).length === 0 && (
                <div className="text-sm text-slate-500 dark:text-slate-400 italic">Nothing here yet — use Add to create a line.</div>
              )}
              {list.length > 0 &&
                list.map(({ item: it, idx }) => {
                  const asset = assets.find(a => a.id === it.asset_id)
                  return (
                    <LineItemCard
                      key={it.uid ?? `idx-${idx}`}
                      item={it}
                      idx={idx}
                      typeKey={typeKey}
                      accounts={sortedAccounts}
                      assets={sortedAssets}
                      asset={asset}
                      preview={previewFor(lockedOffset + idx)}
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

/**
 * Live read-out of the null-remainder rules, meant to sit next to the submit
 * button. Purely advisory — the server revalidates everything on save.
 */
export function TransactionBalanceSummary({
  items,
  lockedItems = [],
  accounts,
  assets,
}: {
  items: LineItemData[]
  lockedItems?: LineItemData[]
  accounts: Account[]
  assets: Asset[]
}) {
  const preview = useMemo(() => preview_form_line_items(items, lockedItems, accounts, assets), [items, lockedItems, accounts, assets])

  if (preview.ok)
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
        <svg aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>This transaction balances. Any blank line is worked out when you save.</span>
      </div>
    )

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <svg aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div className="flex-1">
          <p className="font-semibold">This may not save yet</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            {preview.problems.map(p => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
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
  preview?: PreviewLine
  onUpdateItem: (idx: number, field: keyof LineItemData, value: string | null) => void
  onRemoveItem: (idx: number) => void
  locked?: boolean
}

function LineItemCard({
  item,
  idx,
  typeKey,
  accounts,
  assets,
  asset,
  preview = emptyPreviewLine,
  onUpdateItem,
  onRemoveItem,
  locked = false,
}: LineItemCardProps) {
  const fieldCls =
    'w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800'
  const labelCls = 'block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2'

  const isRupees = asset?.type === asset_type.rupees
  const uid = useId()
  const [dateOpen, setDateOpen] = useState(false)
  // an inherited-date line stays collapsed until asked for; a line that already
  // carries an override always shows it (reconciliation honours those)
  const showDate = dateOpen || item.datetime !== ''

  return (
    <div
      className={`bg-slate-50 dark:bg-slate-700 rounded-lg p-4 border ${locked ? 'border-slate-300 dark:border-slate-500' : 'border-slate-200 dark:border-slate-600'}`}
    >
      {locked && (
        <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <label htmlFor={`${uid}-account`} className={labelCls}>
            Account
          </label>
          {/* Searchable: these lists grow past what a native select scans comfortably. */}
          <Combobox
            id={`${uid}-account`}
            options={accounts.filter(a => a.type === typeKey && (locked || !a.linked)).map(a => ({ id: a.id, name: a.name }))}
            value={item.accounting_head_id}
            onChange={id => onUpdateItem(idx, 'accounting_head_id', id)}
            disabled={locked}
          />
        </div>

        <div>
          <label htmlFor={`${uid}-asset`} className={labelCls}>
            Asset
          </label>
          <Combobox
            id={`${uid}-asset`}
            options={assets.map(a => ({ id: a.id, name: a.name, hint: asset_type_label(a.type) }))}
            value={item.asset_id}
            onChange={id => onUpdateItem(idx, 'asset_id', id)}
            disabled={locked}
          />
        </div>

        <div>
          <label htmlFor={`${uid}-quantity`} className={labelCls}>
            {isRupees ? 'Amount (₹)' : 'Quantity'}
          </label>
          <div className="relative">
            {isRupees && (
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 dark:text-slate-400">₹</span>
            )}
            <input
              id={`${uid}-quantity`}
              type="number"
              step="any"
              placeholder="- out / + in"
              value={item.quantity ?? ''}
              onChange={e => onUpdateItem(idx, 'quantity', e.target.value === '' ? null : e.target.value)}
              disabled={locked}
              className={`${fieldCls}${isRupees ? ' pl-7' : ''}`}
            />
          </div>
          <DerivedHint
            blank={preview.is_blank}
            value={preview.derived_quantity}
            isZero={preview.is_zero}
            rupees={isRupees}
            required={typeKey === 'account'}
          />
        </div>

        {!isRupees && (
          <div>
            <label htmlFor={`${uid}-value`} className={labelCls}>
              Value (₹)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 dark:text-slate-400">₹</span>
              <input
                id={`${uid}-value`}
                type="number"
                step="any"
                placeholder="Book value"
                value={item.txn_value ?? ''}
                onChange={e => onUpdateItem(idx, 'txn_value', e.target.value === '' ? null : e.target.value)}
                disabled={locked}
                className={`${fieldCls} pl-7`}
              />
            </div>
            <DerivedHint
              blank={item.txn_value === null || item.txn_value === ''}
              value={preview.derived_txn_value}
              isZero={false}
              rupees
              required={typeKey === 'account'}
            />
          </div>
        )}
        <div>
          <label htmlFor={`${uid}-note`} className={labelCls}>
            Line note
          </label>
          <input
            id={`${uid}-note`}
            type="text"
            value={item.description}
            onChange={e => onUpdateItem(idx, 'description', e.target.value)}
            placeholder="Optional note for this line"
            disabled={locked}
            className={fieldCls}
          />
        </div>
      </div>

      <div className={`mt-3 flex-wrap items-center justify-between gap-3 ${locked && !showDate ? 'hidden' : 'flex'}`}>
        <div className="flex flex-wrap items-center gap-2">
          {showDate ? (
            <>
              <label htmlFor={`${uid}-date`} className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Custom date
              </label>
              <input
                id={`${uid}-date`}
                type="datetime-local"
                value={item.datetime}
                onChange={e => onUpdateItem(idx, 'datetime', e.target.value)}
                disabled={locked}
                className="px-2 py-1 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-70 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800"
              />
              {!locked && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateItem(idx, 'datetime', '')
                    setDateOpen(false)
                  }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
                >
                  Use the transaction date
                </button>
              )}
            </>
          ) : (
            !locked && (
              <button
                type="button"
                onClick={() => setDateOpen(true)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Set custom date
              </button>
            )
          )}
        </div>

        {!locked && (
          <button
            type="button"
            onClick={() => onRemoveItem(idx)}
            className="inline-flex items-center gap-1 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * What the server will fill into a line left blank. Rendered beside the field
 * rather than typed into it — the value is derived on save, not entered.
 *
 * `required` marks the account lines, which are the one place the null-remainder
 * scheme never fills in for you: a blank there is an error, not a promise.
 *
 * The amount is formatted directly rather than through `MaskedAmount`: it is an echo of a figure
 * the user just typed into an unmasked input a few pixels away, so masking it hides nothing and
 * only blanks out the preview — and `MaskedAmount` renders a `role="button"`, which would drop a
 * fake tab stop between every amount field and the next.
 */
function DerivedHint({
  blank,
  value,
  isZero,
  rupees,
  required,
}: {
  blank: boolean
  value: number | null
  isZero: boolean
  rupees: boolean
  required: boolean
}) {
  if (!blank) {
    if (!isZero) return null
    return <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Zero amounts are not allowed</p>
  }

  if (value === null) {
    // Neutral, not alarming: on a pristine form this is a statement of the rule, not an error.
    if (required) return <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">Required — account lines are never worked out</p>
    return <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 italic">Left blank — worked out on save</p>
  }

  return (
    <p className={`mt-1 text-xs ${isZero ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
      <span className="font-medium">= {rupees ? currency_fmt.format(value) : qty_fmt.format(value)}</span>{' '}
      <span className="italic">{isZero ? '(auto — zero is not allowed)' : '(auto)'}</span>
    </p>
  )
}
