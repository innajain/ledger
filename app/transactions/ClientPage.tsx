'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { currency_fmt } from '../_utils/currency_formatter'
import { format_day } from '../_utils/format_date'
import { CloseIcon } from '../_components/icons'
import { MaskedAmount } from '../_components/MaskedAmount'
import { PageHeader } from '../_components/PageHeader'
import { EmptyState } from '../_components/EmptyState'
import { TransactionEmptyIcon } from '../_components/EmptyStateIcons'
import { LocalDateTime } from '../_components/LocalDateTime'
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

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" createUrl="/transactions/create" createLabel="New transaction" />

      {templates && templates.length > 0 && (
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none">
          {dedupe_template_chips(templates).map(t => (
            <div
              key={t.id}
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
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate max-w-37.5 sm:max-w-62.5">
                {t.description || 'Unnamed template'}
              </div>
            </div>
          ))}
        </div>
      )}

      {deletingTemplate && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg overflow-hidden w-36 animate-scale-in"
          style={{ top: deletingTemplate.y, left: deletingTemplate.x }}
        >
          <button
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
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              type="text"
              placeholder="Search transactions…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium w-full md:w-auto"
          >
            Filters {hasFilters && <span className="ml-1 text-blue-600 dark:text-blue-400">●</span>}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-in-up">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sort</label>
              <select
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Show</label>
              <select
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">From date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">To date</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Min amount</label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Max amount</label>
              <input
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Account</label>
              <select
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Asset</label>
              <select
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Reference</label>
              <input
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
                onClick={clearFilters}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all hover:scale-105"
              >
                Clear all
              </button>
              <button
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
          <button onClick={clearFilters} className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 ml-1">
            Clear all
          </button>
        </div>
      )}

      {transactions.length > 0 ? (
        <>
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
              {transactions.map(tx => {
                const borderCls =
                  tx.link_severity === 'error'
                    ? 'border-l-4 border-l-red-400 dark:border-l-red-500'
                    : tx.link_severity === 'warning'
                      ? 'border-l-4 border-l-amber-400 dark:border-l-amber-500'
                      : tx.link_severity === 'info'
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
                  <li key={tx.id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${borderCls}`}>
                    <Link href={`/transactions/${tx.id}`} className="block px-6 py-4 group">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <div className="shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                {tx.description || 'No description'}
                              </p>
                              <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 min-w-0">
                                <LocalDateTime value={tx.date} />
                                {tx.external_ref && (
                                  <span className="hidden sm:inline text-xs font-mono text-slate-400 dark:text-slate-500 truncate">
                                    {tx.external_ref}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="ml-4 shrink-0 flex items-center gap-2">
                          {badge}
                          {tx.total_book !== 0 ? (
                            <span
                              className={`text-lg font-semibold inline-block ${
                                tx.total_book > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {/* a masked amount carries no sign, so direction must not ride on colour alone */}
                              <span aria-hidden="true">{tx.total_book > 0 ? '▲ ' : '▼ '}</span>
                              <span className="sr-only">{tx.total_book > 0 ? 'Money in, ' : 'Money out, '}</span>
                              <MaskedAmount value={tx.total_book} />
                            </span>
                          ) : (
                            /* a zero net flow (e.g. a transfer) still deserves a figure, not a blank cell */
                            <span className="text-lg font-semibold text-slate-500 dark:text-slate-400">{currency_fmt.format(0)}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>

          {}
          {totalPages > 1 && !isShowingAll && (
            <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-4 transition-colors gap-2">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </button>
              <div className="flex items-center gap-1 sm:gap-2">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (currentPage <= 3) {
                    pageNum = i + 1
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = currentPage - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-sm font-medium rounded-lg transition-colors min-w-9 ${
                        currentPage === pageNum
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}
              </div>
              <button
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white shadow-xl animate-slide-in-up max-w-[calc(100vw-2rem)]">
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
            className="shrink-0 text-slate-300 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {undoDone && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-5 py-3 rounded-lg bg-green-700 text-white shadow-xl animate-slide-in-up">
          <p className="text-sm font-medium">
            Transaction restored.{' '}
            <Link href={`/transactions/${undoDone}`} className="underline hover:no-underline">
              View it
            </Link>
          </p>
          <button type="button" onClick={() => setUndoDone(null)} className="shrink-0 text-green-200 hover:text-white" aria-label="Dismiss">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
