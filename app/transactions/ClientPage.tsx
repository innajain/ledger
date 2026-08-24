'use client'

import React, { useState, useEffect, useMemo, useRef, useId } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { currency_fmt } from '../_utils/currency_formatter'
import { format_day } from '../_utils/format_date'
import { CloseIcon } from '../_components/icons'
import { MaskedAmount } from '../_components/MaskedAmount'
import { PageHeader } from '../_components/PageHeader'
import { EmptyState } from '../_components/EmptyState'
import { TransactionEmptyIcon } from '../_components/EmptyStateIcons'
import { delete_transaction_template } from '../_actions/templates'
import { create_transaction, type DeletedTransactionSnapshot } from '../_actions/transactions'
import { dedupe_template_chips } from '../_components/HomeTemplateChips'
import { useToast } from '../_components/Toast'

type Transaction = {
  id: string
  date: Date
  description: string | null
  external_ref: string | null
  total_book: number
  link_severity: 'error' | 'warning' | 'info' | null
}

// The whole ledger lives in IST (lib/config USER_TIMEZONE), so day headers and row times
// pin that zone explicitly — identical output on server and client, no hydration dance.
const IST = 'Asia/Kolkata'
const day_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const time_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true })
const full_datetime_fmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const up_ampm = (s: string) => s.replace(/\b(am|pm)\b/g, m => m.toUpperCase())

/** 1 … (current±1) … last, with ellipses only where pages are actually skipped. */
function page_items(current: number, total: number): (number | 'gap')[] {
  const wanted = new Set([1, total, current - 1, current, current + 1])
  const pages = [...wanted].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const p of pages) {
    if (p - prev > 1) out.push('gap')
    out.push(p)
    prev = p
  }
  return out
}

type Account = { id: string; name: string }
type Asset = { id: string; name: string }
type Template = {
  id: string
  description: string | null
  line_items: {
    id: string
    accounting_head_id: string
    asset_id: string
    description: string | null
    quantity: number | null
    txn_value: number | null
    accounting_head: { name: string; type: string }
    asset: { name: string; type: string }
  }[]
}

// Memoized so keystrokes in the search input (parent state) don't re-render the whole list
// before the debounced router.push fires. Everything it renders arrives as a prop or is
// module-level (the Intl formatters); MaskedAmount subscribes to privacy context directly,
// so masking stays live through the memo.
const TransactionsCard = React.memo(function TransactionsCard({
  dayGroups,
  isShowingAll,
  totalCount,
  currentPage,
  pageSize,
}: {
  dayGroups: { label: string | null; txs: Transaction[] }[]
  isShowingAll: boolean
  totalCount: number
  currentPage: number
  pageSize: number
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">All transactions</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {isShowingAll
                ? `All ${totalCount}`
                : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
            </span>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {dayGroups.map(group => (
          <React.Fragment key={group.label ?? 'flat'}>
            {group.label !== null && (
              <li className="px-6 py-2 bg-slate-50 dark:bg-slate-900/40 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {group.label}
              </li>
            )}
            {group.txs.map(tx => {
              const borderCls =
                tx.link_severity === 'error'
                  ? 'border-l-4 border-l-red-400 dark:border-l-red-500'
                  : tx.link_severity === 'warning' || tx.link_severity === 'info'
                    ? 'border-l-4 border-l-amber-400 dark:border-l-amber-500'
                    : ''
              const badge =
                tx.link_severity === 'error' ? (
                  <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                    Rejected
                  </span>
                ) : tx.link_severity === 'warning' ? (
                  <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Needs approval
                  </span>
                ) : tx.link_severity === 'info' ? (
                  <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    Waiting
                  </span>
                ) : null
              return (
                // Stretched-link treatment (see the home cards): the amount needs its own
                // click-to-reveal, so it can't nest inside the row's <Link>. The Link fills
                // the row invisibly; only the amount opts back into pointer events.
                <li key={tx.id} className={`relative hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${borderCls}`}>
                  <Link href={`/transactions/${tx.id}`} className="absolute inset-0 z-0" aria-label={tx.description || 'View transaction'} />
                  <div className="relative z-10 pointer-events-none px-6 py-3.5 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{tx.description || 'No description'}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 min-w-0">
                        <span>
                          {up_ampm(group.label === null ? full_datetime_fmt.format(new Date(tx.date)) : time_fmt.format(new Date(tx.date)))}
                        </span>
                        {tx.external_ref && (
                          <span className="hidden sm:inline text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{tx.external_ref}</span>
                        )}
                      </p>
                    </div>
                    <div className="ml-4 shrink-0 flex items-center gap-2">
                      {badge}
                      {/* Direction rides on the sign (kept even while masked), not on a wall of
                          red: money in is green, money out is plain ink. */}
                      {tx.total_book !== 0 ? (
                        <span
                          className={`text-lg font-semibold inline-block tabular-nums pointer-events-auto ${
                            tx.total_book > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          <MaskedAmount value={tx.total_book} keep_sign />
                        </span>
                      ) : (
                        /* a zero net flow (e.g. a transfer) still deserves a figure, not a blank cell */
                        <span className="text-lg font-semibold text-slate-500 dark:text-slate-400 tabular-nums">{currency_fmt.format(0)}</span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </React.Fragment>
        ))}
      </ul>
    </div>
  )
})

export default function ClientPage({
  transactions,
  totalCount,
  currentPage,
  pageSize,
  searchParams,
  accounts,
  assets,
  templates = [],
}: {
  transactions: Transaction[]
  totalCount: number
  currentPage: number
  pageSize: number
  searchParams: Record<string, string | undefined>
  accounts: Account[]
  assets: Asset[]
  templates?: Template[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const { showToast } = useToast()
  const uid = useId()
  const [showFilters, setShowFilters] = useState(false)
  const [searchInput, setSearchInput] = useState(searchParams.search || '')
  const [refInput, setRefInput] = useState(searchParams.ref || '')
  const [dateFrom, setDateFrom] = useState(searchParams.dateFrom || '')
  const [dateTo, setDateTo] = useState(searchParams.dateTo || '')
  const [minAmount, setMinAmount] = useState(searchParams.minAmount || '')
  const [maxAmount, setMaxAmount] = useState(searchParams.maxAmount || '')
  const [accountId, setAccountId] = useState(searchParams.accountId || '')
  const [assetId, setAssetId] = useState(searchParams.assetId || '')
  const [selectedPageSize] = useState(pageSize)
  const [deletingTemplate, setDeletingTemplate] = useState<{ id: string; x: number; y: number } | null>(null)
  const deleteMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<DeletedTransactionSnapshot | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [undoDone, setUndoDone] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSearchInput(searchParams.search || '')
    setRefInput(searchParams.ref || '')
    setDateFrom(searchParams.dateFrom || '')
    setDateTo(searchParams.dateTo || '')
    setMinAmount(searchParams.minAmount || '')
    setMaxAmount(searchParams.maxAmount || '')
    setAccountId(searchParams.accountId || '')
    setAssetId(searchParams.assetId || '')
  }, [
    searchParams.search,
    searchParams.ref,
    searchParams.dateFrom,
    searchParams.dateTo,
    searchParams.minAmount,
    searchParams.maxAmount,
    searchParams.accountId,
    searchParams.assetId,
  ])

  // A just-deleted transaction stashes a snapshot for one-click undo
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ledger_undo_delete')
      if (!raw) return
      sessionStorage.removeItem('ledger_undo_delete')
      setUndoSnapshot(JSON.parse(raw) as DeletedTransactionSnapshot)
    } catch {}
  }, [])

  async function handleUndoDelete() {
    if (!undoSnapshot || undoBusy) return
    setUndoBusy(true)
    try {
      const result = await create_transaction(
        new Date(undoSnapshot.datetime),
        undoSnapshot.line_items.map(li => ({ ...li, datetime: li.datetime ? new Date(li.datetime) : null })),
        undoSnapshot.description,
      )
      if (!result.success) throw new Error(result.message)
      setUndoSnapshot(null)
      setUndoDone(result.data!.id)
      router.refresh()
    } catch (e) {
      showToast("Couldn't restore the transaction: " + (e instanceof Error ? e.message : String(e)), 'error')
    } finally {
      setUndoBusy(false)
    }
  }

  useEffect(() => {
    const handleGlobalClick = () => setDeletingTemplate(null)
    document.addEventListener('click', handleGlobalClick)
    return () => document.removeEventListener('click', handleGlobalClick)
  }, [])

  useEffect(() => {
    if (deletingTemplate) deleteMenuButtonRef.current?.focus()
  }, [deletingTemplate])

  useEffect(() => {
    const current = searchParams.search || ''
    if (searchInput === current) return
    const t = setTimeout(() => {
      const query = new URLSearchParams(params.toString())
      if (searchInput) query.set('search', searchInput)
      else query.delete('search')
      query.delete('page')
      router.push(`/transactions?${query.toString()}`)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, searchParams.search, params, router])

  const totalPages = Math.ceil(totalCount / pageSize)
  const isShowingAll = searchParams.pageSize === 'all'

  const changePageSize = (newSize: string) => {
    const query = new URLSearchParams(params.toString())
    query.set('pageSize', newSize)
    query.delete('page')
    router.push(`/transactions?${query.toString()}`)
  }

  const changeSort = (sort: string) => {
    const query = new URLSearchParams(params.toString())
    if (sort === 'date_desc') query.delete('sort')
    else query.set('sort', sort)
    query.delete('page')
    router.push(`/transactions?${query.toString()}`)
  }

  const applyFilters = () => {
    const query = new URLSearchParams()
    if (searchInput) query.set('search', searchInput)
    if (refInput) query.set('ref', refInput)
    if (dateFrom) query.set('dateFrom', dateFrom)
    if (dateTo) query.set('dateTo', dateTo)
    if (minAmount) query.set('minAmount', minAmount)
    if (maxAmount) query.set('maxAmount', maxAmount)
    if (accountId) query.set('accountId', accountId)
    if (assetId) query.set('assetId', assetId)
    setShowFilters(false)
    router.push(`/transactions?${query.toString()}`)
  }

  const clearFilters = () => {
    setSearchInput('')
    setRefInput('')
    setDateFrom('')
    setDateTo('')
    setMinAmount('')
    setMaxAmount('')
    setAccountId('')
    setAssetId('')
    setShowFilters(false)
    router.push('/transactions')
  }

  const removeFilter = (key: string) => {
    const query = new URLSearchParams(params.toString())
    query.delete(key)
    query.delete('page')
    router.push(`/transactions?${query.toString()}`)
  }

  const goToPage = (page: number) => {
    const query = new URLSearchParams(params.toString())
    query.set('page', page.toString())
    router.push(`/transactions?${query.toString()}`)
  }

  const hasFilters = !!(
    searchParams.search ||
    searchParams.ref ||
    searchParams.dateFrom ||
    searchParams.dateTo ||
    searchParams.minAmount ||
    searchParams.maxAmount ||
    searchParams.accountId ||
    searchParams.assetId
  )

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? id
  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? id

  const activeChips: { key: string; label: string }[] = []
  if (searchParams.search) activeChips.push({ key: 'search', label: `Search: "${searchParams.search}"` })
  if (searchParams.ref) activeChips.push({ key: 'ref', label: `Ref: ${searchParams.ref}` })
  if (searchParams.dateFrom) activeChips.push({ key: 'dateFrom', label: `From: ${format_day(searchParams.dateFrom)}` })
  if (searchParams.dateTo) activeChips.push({ key: 'dateTo', label: `To: ${format_day(searchParams.dateTo)}` })
  if (searchParams.minAmount) activeChips.push({ key: 'minAmount', label: `Min: ${currency_fmt.format(parseFloat(searchParams.minAmount))}` })
  if (searchParams.maxAmount) activeChips.push({ key: 'maxAmount', label: `Max: ${currency_fmt.format(parseFloat(searchParams.maxAmount))}` })
  if (searchParams.accountId) activeChips.push({ key: 'accountId', label: `Account: ${accountName(searchParams.accountId)}` })
  if (searchParams.assetId) activeChips.push({ key: 'assetId', label: `Asset: ${assetName(searchParams.assetId)}` })

  // Rows group under day headers when the list is date-sorted (the ledger's home order).
  // Amount sorts get a flat list with full dates — day headers would interleave meaninglessly.
  // Everything formats in the ledger's own timezone so the server and client render agree.
  const dateSorted = !searchParams.sort || searchParams.sort.startsWith('date')
  const dayGroups = useMemo(() => {
    const groups: { label: string | null; txs: Transaction[] }[] = []
    if (dateSorted) {
      for (const tx of transactions) {
        const label = day_fmt.format(new Date(tx.date))
        const last = groups[groups.length - 1]
        if (last && last.label === label) last.txs.push(tx)
        else groups.push({ label, txs: [tx] })
      }
    } else {
      groups.push({ label: null, txs: transactions })
    }
    return groups
  }, [transactions, dateSorted])

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" createUrl="/transactions/create" createLabel="New transaction" />

      {templates && templates.length > 0 && (
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none">
          {dedupe_template_chips(templates).map(t => (
            <button
              key={t.id}
              type="button"
              className="flex items-center shrink-0 py-1.5 px-3 border border-slate-200 dark:border-slate-600 rounded-full bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group cursor-pointer relative"
              onClick={e => {
                if (deletingTemplate?.id === t.id) {
                  e.stopPropagation()
                  setDeletingTemplate(null)
                  return
                }
                try {
                  sessionStorage.setItem('ledger_quick_template', JSON.stringify(t))
                } catch {}
                router.push(`/transactions/create?templateId=${t.id}`)
              }}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                setDeletingTemplate({ id: t.id, x: e.clientX, y: e.clientY })
              }}
            >
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-37.5 sm:max-w-62.5">
                {t.description || 'Unnamed template'}
              </span>
            </button>
          ))}
        </div>
      )}

      {deletingTemplate && (
        <div
          role="menu"
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg overflow-hidden w-36 animate-scale-in"
          style={{ top: deletingTemplate.y, left: deletingTemplate.x }}
          onKeyDown={e => {
            if (e.key === 'Escape') setDeletingTemplate(null)
          }}
        >
          <button
            ref={deleteMenuButtonRef}
            type="button"
            role="menuitem"
            onClick={async e => {
              e.stopPropagation()
              const id = deletingTemplate.id
              setDeletingTemplate(null)
              if (confirm('Delete this template?')) {
                await delete_transaction_template(id)
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
          >
            <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete
          </button>
        </div>
      )}

      {}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 transition-colors">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="search"
              aria-label="Search transactions"
              placeholder="Search transactions…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls={`${uid}-filter-panel`}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium w-full md:w-auto"
          >
            Filters {hasFilters && <span className="ml-1 text-blue-600 dark:text-blue-400">●</span>}
          </button>
        </div>

        {showFilters && (
          <div
            id={`${uid}-filter-panel`}
            className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-in-up"
          >
            <div>
              <label htmlFor={`${uid}-sort`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Sort
              </label>
              <select
                id={`${uid}-sort`}
                value={searchParams.sort || 'date_desc'}
                onChange={e => changeSort(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="date_desc">Date (newest)</option>
                <option value="date_asc">Date (oldest)</option>
                <option value="amount_desc">Amount (high → low)</option>
                <option value="amount_asc">Amount (low → high)</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-show`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Show
              </label>
              <select
                id={`${uid}-show`}
                value={isShowingAll ? 'all' : selectedPageSize}
                onChange={e => changePageSize(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-date-from`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                From date
              </label>
              <input
                id={`${uid}-date-from`}
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-date-to`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                To date
              </label>
              <input
                id={`${uid}-date-to`}
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-min-amount`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Min amount
              </label>
              <input
                id={`${uid}-min-amount`}
                type="number"
                step="0.01"
                value={minAmount}
                onChange={e => setMinAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-max-amount`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Max amount
              </label>
              <input
                id={`${uid}-max-amount`}
                type="number"
                step="0.01"
                value={maxAmount}
                onChange={e => setMaxAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-account`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Account
              </label>
              <select
                id={`${uid}-account`}
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="">All accounts</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-asset`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Asset
              </label>
              <select
                id={`${uid}-asset`}
                value={assetId}
                onChange={e => setAssetId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              >
                <option value="">All assets</option>
                {assets.map(asset => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-reference`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reference
              </label>
              <input
                id={`${uid}-reference`}
                type="text"
                value={refInput}
                onChange={e => setRefInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                placeholder="Bank / UPI ref"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 font-mono text-sm"
              />
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              >
                Apply filters
              </button>
            </div>
          </div>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => removeFilter(chip.key)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
              title="Remove filter"
            >
              <span>{chip.label}</span>
              <span aria-hidden className="text-blue-500 dark:text-blue-400">
                ✕
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 ml-1"
          >
            Clear all
          </button>
        </div>
      )}

      {transactions.length > 0 ? (
        <>
          <TransactionsCard dayGroups={dayGroups} isShowingAll={isShowingAll} totalCount={totalCount} currentPage={currentPage} pageSize={pageSize} />

          {}
          {totalPages > 1 && !isShowingAll && (
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 transition-colors gap-2">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </button>
              <div className="flex items-center gap-1 sm:gap-2">
                {page_items(currentPage, totalPages).map((item, i) =>
                  item === 'gap' ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-slate-400 dark:text-slate-500 select-none">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => goToPage(item)}
                      aria-current={currentPage === item ? 'page' : undefined}
                      className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-sm font-medium rounded-lg transition-colors min-w-9 tabular-nums ${
                        currentPage === item
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<TransactionEmptyIcon />}
          title={hasFilters ? 'No matching transactions' : 'No transactions yet'}
          description={
            hasFilters
              ? 'Try adjusting your filters'
              : 'A transaction records money moving between your accounts, allocations and categories in one balanced entry.'
          }
          actionUrl="/transactions/create"
          actionLabel="New transaction"
        />
      )}

      {undoSnapshot && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white shadow-xl animate-slide-in-up max-w-[calc(100vw-2rem)]"
        >
          <div className="text-sm min-w-0">
            <p className="font-medium truncate">Transaction deleted{undoSnapshot.description ? ` — “${undoSnapshot.description}”` : ''}</p>
            {undoSnapshot.had_attachments && <p className="text-xs text-slate-300 dark:text-slate-400">Attachments can’t be restored</p>}
          </div>
          <button
            type="button"
            onClick={handleUndoDelete}
            disabled={undoBusy}
            className="shrink-0 px-3 py-1.5 text-sm font-semibold rounded-lg bg-white/15 hover:bg-white/25 disabled:opacity-50 transition-colors"
          >
            {undoBusy ? 'Restoring…' : 'Undo'}
          </button>
          <button
            type="button"
            onClick={() => setUndoSnapshot(null)}
            className="shrink-0 p-1 -m-1 text-slate-300 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {undoDone && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-3 rounded-lg bg-green-700 text-white shadow-xl animate-slide-in-up"
        >
          <p className="text-sm font-medium">
            Transaction restored.{' '}
            <Link href={`/transactions/${undoDone}`} className="underline hover:no-underline">
              View it
            </Link>
          </p>
          <button type="button" onClick={() => setUndoDone(null)} className="shrink-0 p-1 -m-1 text-green-200 hover:text-white" aria-label="Dismiss">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
