'use client'

import React, { useState, useEffect, useMemo, useRef, useId } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { currency_fmt } from '../_utils/currency_formatter'
import { format_day } from '../_utils/format_date'
import { CloseIcon } from '../_components/icons'
import { MaskedAmount } from '../_components/MaskedAmount'
import { PageHeader } from '../_components/PageHeader'
import { ButtonLink } from '../_components/Button'
import { EmptyState } from '../_components/EmptyState'
import { TransactionEmptyIcon } from '../_components/EmptyStateIcons'
import { delete_transaction_template } from '../_actions/templates'
import { create_transaction, type DeletedTransactionSnapshot } from '../_actions/transactions'
import { dedupe_template_chips } from '../_components/HomeTemplateChips'
import { useToast } from '../_components/Toast'
import { useConfirm } from '../_components/Confirm'

type Transaction = {
  id: string
  date: Date
  description: string | null
  total_book: number
  link_severity: 'error' | 'warning' | 'info' | null
  /** Scheduled for today (IST) or earlier — only ever true on the future list. */
  is_due: boolean
  /** The user's own labels on this transaction (see /tags). */
  tags: { id: string; name: string }[]
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
type Tag = { id: string; name: string }
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
// A small square status tag — the paper version of a coloured pill.
const TAG = 'shrink-0 text-[11px] font-medium uppercase tracking-wide px-1.5 py-px rounded-sm border'

const TransactionsCard = React.memo(function TransactionsCard({
  dayGroups,
  isShowingAll,
  totalCount,
  currentPage,
  pageSize,
  showingFuture,
}: {
  dayGroups: { label: string | null; txs: Transaction[] }[]
  isShowingAll: boolean
  totalCount: number
  currentPage: number
  pageSize: number
  showingFuture: boolean
}) {
  return (
    <div className="sheet">
      <div className="px-4 sm:px-6 pt-5 pb-1 flex items-baseline justify-between flex-wrap gap-3">
        <h2 className="text-xl font-medium text-ink">{showingFuture ? 'Future transactions' : 'All transactions'}</h2>
        <span className="text-xs text-ink-3 num">
          {isShowingAll
            ? `All ${totalCount}`
            : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
        </span>
      </div>
      <ul>
        {dayGroups.map(group => (
          <React.Fragment key={group.label ?? 'flat'}>
            {group.label !== null && (
              // A day's heading carries the day's net flow, the way a ledger page totals
              // each date before the next begins.
              <li className="px-4 sm:px-6 pt-5 pb-1.5 border-b border-rule-strong flex items-baseline justify-between gap-4 text-[11px] font-medium uppercase tracking-[0.09em] text-ink-3">
                <span>{group.label}</span>
                <MaskedAmount value={group.txs.reduce((sum, t) => sum + t.total_book, 0)} keep_sign interactive={false} className="tracking-normal" />
              </li>
            )}
            {group.txs.map((tx, i) => {
              const borderCls =
                tx.link_severity === 'error'
                  ? 'border-l-2 border-l-neg'
                  : tx.link_severity === 'warning' || tx.link_severity === 'info'
                    ? 'border-l-2 border-l-warn'
                    : ''
              const badge =
                tx.link_severity === 'error' ? (
                  <span className={`${TAG} text-neg border-neg/40`}>Rejected</span>
                ) : tx.link_severity === 'warning' ? (
                  <span className={`${TAG} text-warn border-warn/40`}>Needs approval</span>
                ) : tx.link_severity === 'info' ? (
                  <span className={`${TAG} text-warn border-warn/40`}>Waiting</span>
                ) : null
              return (
                // Stretched-link treatment (see the home cards): the amount needs its own
                // click-to-reveal, so it can't nest inside the row's <Link>. The Link fills
                // the row invisibly; only the amount opts back into pointer events.
                <li key={tx.id} className={`relative hover:bg-sunken transition-colors ${i > 0 ? 'border-t border-rule' : ''} ${borderCls}`}>
                  <Link href={`/transactions/${tx.id}`} className="absolute inset-0 z-0" aria-label={tx.description || 'View transaction'} />
                  <div className="relative z-10 pointer-events-none px-4 sm:px-6 py-2.5 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{tx.description || 'No description'}</p>
                      <p className="text-xs text-ink-3 flex items-center gap-2 min-w-0 mt-0.5">
                        <span>
                          {up_ampm(group.label === null ? full_datetime_fmt.format(new Date(tx.date)) : time_fmt.format(new Date(tx.date)))}
                        </span>
                        {/* Plain text, not links: the whole row is already one stretched
                            <Link>, and a nested anchor there is invalid and unclickable. */}
                        {tx.tags.length > 0 && <span className="truncate">· {tx.tags.map(g => g.name).join(', ')}</span>}
                      </p>
                    </div>
                    <div className="ml-4 shrink-0 flex items-center gap-2">
                      {tx.is_due && <span className={`${TAG} text-warn border-warn/40`}>Due</span>}
                      {badge}
                      {/* Direction rides on the sign (kept even while masked), not on a wall of
                          red: money in is green, money out is plain ink. */}
                      {tx.total_book !== 0 ? (
                        <span className={`text-[15px] inline-block pointer-events-auto ${tx.total_book > 0 ? 'text-pos' : 'text-ink'}`}>
                          <MaskedAmount value={tx.total_book} keep_sign />
                        </span>
                      ) : (
                        /* a zero net flow (e.g. a transfer) still deserves a figure, not a blank cell */
                        <span className="text-[15px] text-ink-3 num">{currency_fmt.format(0)}</span>
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
  tags = [],
  templates = [],
}: {
  transactions: Transaction[]
  totalCount: number
  currentPage: number
  pageSize: number
  searchParams: Record<string, string | undefined>
  accounts: Account[]
  assets: Asset[]
  tags?: Tag[]
  templates?: Template[]
}) {
  const router = useRouter()
  const params = useSearchParams()
  const { showToast } = useToast()
  const confirm = useConfirm()
  const uid = useId()
  const [showFilters, setShowFilters] = useState(false)
  const [searchInput, setSearchInput] = useState(searchParams.search || '')
  const [dateFrom, setDateFrom] = useState(searchParams.dateFrom || '')
  const [dateTo, setDateTo] = useState(searchParams.dateTo || '')
  const [minAmount, setMinAmount] = useState(searchParams.minAmount || '')
  const [maxAmount, setMaxAmount] = useState(searchParams.maxAmount || '')
  const [accountId, setAccountId] = useState(searchParams.accountId || '')
  const [assetId, setAssetId] = useState(searchParams.assetId || '')
  const [tagId, setTagId] = useState(searchParams.tagId || '')
  const [selectedPageSize] = useState(pageSize)
  const [deletingTemplate, setDeletingTemplate] = useState<{ id: string; x: number; y: number } | null>(null)
  const deleteMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [undoSnapshot, setUndoSnapshot] = useState<DeletedTransactionSnapshot | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [undoDone, setUndoDone] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSearchInput(searchParams.search || '')
    setDateFrom(searchParams.dateFrom || '')
    setDateTo(searchParams.dateTo || '')
    setMinAmount(searchParams.minAmount || '')
    setMaxAmount(searchParams.maxAmount || '')
    setAccountId(searchParams.accountId || '')
    setAssetId(searchParams.assetId || '')
    setTagId(searchParams.tagId || '')
  }, [
    searchParams.search,
    searchParams.dateFrom,
    searchParams.dateTo,
    searchParams.minAmount,
    searchParams.maxAmount,
    searchParams.accountId,
    searchParams.assetId,
    searchParams.tagId,
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
        // Tag membership is plain rows, so unlike attachments it does come back.
        { tag_ids: undoSnapshot.tag_ids },
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
  const showingFuture = searchParams.future === 'future'

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

  const changeFuture = (future: string) => {
    const query = new URLSearchParams(params.toString())
    if (future === 'future') query.set('future', 'future')
    else query.delete('future')
    query.delete('page')
    router.push(`/transactions?${query.toString()}`)
  }

  const applyFilters = () => {
    const query = new URLSearchParams()
    if (searchInput) query.set('search', searchInput)
    if (dateFrom) query.set('dateFrom', dateFrom)
    if (dateTo) query.set('dateTo', dateTo)
    if (minAmount) query.set('minAmount', minAmount)
    if (maxAmount) query.set('maxAmount', maxAmount)
    if (accountId) query.set('accountId', accountId)
    if (assetId) query.set('assetId', assetId)
    if (tagId) query.set('tagId', tagId)
    // The real/future switch lives outside this panel, so applying filters must not
    // silently drop it.
    if (showingFuture) query.set('future', 'future')
    setShowFilters(false)
    router.push(`/transactions?${query.toString()}`)
  }

  const clearFilters = () => {
    setSearchInput('')
    setDateFrom('')
    setDateTo('')
    setMinAmount('')
    setMaxAmount('')
    setAccountId('')
    setAssetId('')
    setTagId('')
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

  const hasOtherFilters = !!(
    searchParams.search ||
    searchParams.dateFrom ||
    searchParams.dateTo ||
    searchParams.minAmount ||
    searchParams.maxAmount ||
    searchParams.accountId ||
    searchParams.assetId ||
    searchParams.tagId
  )
  const hasFilters = hasOtherFilters || showingFuture

  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? id
  const assetName = (id: string) => assets.find(a => a.id === id)?.name ?? id
  const tagName = (id: string) => tags.find(g => g.id === id)?.name ?? id

  const activeChips: { key: string; label: string }[] = []
  if (searchParams.search) activeChips.push({ key: 'search', label: `Search: "${searchParams.search}"` })
  if (searchParams.dateFrom) activeChips.push({ key: 'dateFrom', label: `From: ${format_day(searchParams.dateFrom)}` })
  if (searchParams.dateTo) activeChips.push({ key: 'dateTo', label: `To: ${format_day(searchParams.dateTo)}` })
  if (searchParams.minAmount) activeChips.push({ key: 'minAmount', label: `Min: ${currency_fmt.format(parseFloat(searchParams.minAmount))}` })
  if (searchParams.maxAmount) activeChips.push({ key: 'maxAmount', label: `Max: ${currency_fmt.format(parseFloat(searchParams.maxAmount))}` })
  if (searchParams.accountId) activeChips.push({ key: 'accountId', label: `Account: ${accountName(searchParams.accountId)}` })
  if (searchParams.assetId) activeChips.push({ key: 'assetId', label: `Asset: ${assetName(searchParams.assetId)}` })
  if (searchParams.tagId) activeChips.push({ key: 'tagId', label: `Tag: ${tagName(searchParams.tagId)}` })
  if (showingFuture) activeChips.push({ key: 'future', label: 'Future transactions' })

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
      <PageHeader
        title="Transactions"
        createUrl="/transactions/create"
        createLabel="New transaction"
        actions={
          <ButtonLink href="/tags" variant="secondary" className="sm:whitespace-nowrap">
            Tags
          </ButtonLink>
        }
      />

      {templates && templates.length > 0 && (
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] scrollbar-none">
          {dedupe_template_chips(templates).map(t => (
            <button
              key={t.id}
              type="button"
              className="flex items-center shrink-0 py-1 px-2.5 border border-rule-strong rounded-lg hover:bg-sunken transition-colors group cursor-pointer relative"
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
              <span className="text-sm font-medium text-ink truncate max-w-37.5 sm:max-w-62.5">{t.description || 'Unnamed template'}</span>
            </button>
          ))}
        </div>
      )}

      {deletingTemplate && (
        <div
          role="menu"
          className="fixed z-50 bg-paper border border-rule shadow-xl rounded-lg overflow-hidden w-36 animate-scale-in"
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
              if (await confirm({ title: 'Delete this template?', confirmLabel: 'Delete', danger: true })) {
                await delete_transaction_template(id)
              }
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-neg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
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
      <div>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <input
              type="search"
              aria-label="Search transactions"
              placeholder="Search transactions…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent bg-raised text-ink placeholder:text-ink-3"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls={`${uid}-filter-panel`}
            className="px-4 py-2 border border-rule-strong text-ink-2 rounded-lg hover:bg-sunken transition-colors font-medium w-full md:w-auto"
          >
            Filters {hasFilters && <span className="ml-1 text-accent">●</span>}
          </button>
        </div>

        {showFilters && (
          <div id={`${uid}-filter-panel`} className="mt-4 pt-4 border-t border-rule grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-in-up">
            <div>
              <label htmlFor={`${uid}-sort`} className="block text-sm font-medium text-ink-2 mb-1">
                Sort
              </label>
              <select
                id={`${uid}-sort`}
                value={searchParams.sort || 'date_desc'}
                onChange={e => changeSort(e.target.value)}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg text-sm bg-raised text-ink focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="date_desc">Date (newest)</option>
                <option value="date_asc">Date (oldest)</option>
                <option value="amount_desc">Amount (high → low)</option>
                <option value="amount_asc">Amount (low → high)</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-show`} className="block text-sm font-medium text-ink-2 mb-1">
                Show
              </label>
              <select
                id={`${uid}-show`}
                value={isShowingAll ? 'all' : selectedPageSize}
                onChange={e => changePageSize(e.target.value)}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg text-sm bg-raised text-ink focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="all">All</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-type`} className="block text-sm font-medium text-ink-2 mb-1">
                Type
              </label>
              <select
                id={`${uid}-type`}
                value={showingFuture ? 'future' : 'real'}
                onChange={e => changeFuture(e.target.value)}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg text-sm bg-raised text-ink focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="real">Real transactions</option>
                <option value="future">Future transactions</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-date-from`} className="block text-sm font-medium text-ink-2 mb-1">
                From date
              </label>
              <input
                id={`${uid}-date-from`}
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-date-to`} className="block text-sm font-medium text-ink-2 mb-1">
                To date
              </label>
              <input
                id={`${uid}-date-to`}
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-min-amount`} className="block text-sm font-medium text-ink-2 mb-1">
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
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-max-amount`} className="block text-sm font-medium text-ink-2 mb-1">
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
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-account`} className="block text-sm font-medium text-ink-2 mb-1">
                Account
              </label>
              <select
                id={`${uid}-account`}
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink"
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
              <label htmlFor={`${uid}-asset`} className="block text-sm font-medium text-ink-2 mb-1">
                Asset
              </label>
              <select
                id={`${uid}-asset`}
                value={assetId}
                onChange={e => setAssetId(e.target.value)}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink"
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
              <label htmlFor={`${uid}-group`} className="block text-sm font-medium text-ink-2 mb-1">
                Tag
              </label>
              <select
                id={`${uid}-group`}
                value={tagId}
                onChange={e => setTagId(e.target.value)}
                disabled={tags.length === 0}
                className="w-full px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink disabled:opacity-60"
              >
                <option value="">All tags</option>
                {tags.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {tags.length === 0 && (
                <p className="mt-1 text-xs text-ink-3">
                  No tags yet —{' '}
                  <Link href="/tags" className="underline hover:no-underline">
                    create one
                  </Link>{' '}
                  to bundle similar transactions.
                </p>
              )}
            </div>
            <div className="md:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={clearFilters} className="px-4 py-2 text-ink-2 hover:text-ink transition-colors">
                Clear all
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent-hover transition-colors"
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
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft border border-accent/30 text-sm text-accent hover:bg-accent-soft transition-colors"
              title="Remove filter"
            >
              <span>{chip.label}</span>
              <span aria-hidden className="text-accent">
                ✕
              </span>
            </button>
          ))}
          <button type="button" onClick={clearFilters} className="text-sm text-ink-3 hover:text-ink ml-1">
            Clear all
          </button>
        </div>
      )}

      {transactions.length > 0 ? (
        <>
          <TransactionsCard
            dayGroups={dayGroups}
            isShowingAll={isShowingAll}
            totalCount={totalCount}
            currentPage={currentPage}
            pageSize={pageSize}
            showingFuture={showingFuture}
          />

          {}
          {totalPages > 1 && !isShowingAll && (
            <div className="sheet flex items-center justify-between px-4 sm:px-6 py-4 gap-2">
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-ink-2 bg-raised border border-rule-strong rounded-lg hover:bg-sunken disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="hidden sm:inline">Previous</span>
                <span className="sm:hidden">Prev</span>
              </button>
              <div className="flex items-center gap-1 sm:gap-2">
                {page_items(currentPage, totalPages).map((item, i) =>
                  item === 'gap' ? (
                    <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-ink-3 select-none">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => goToPage(item)}
                      aria-current={currentPage === item ? 'page' : undefined}
                      className={`px-2.5 sm:px-3 py-1.5 sm:py-1 text-sm font-medium rounded-lg transition-colors min-w-9 tabular-nums ${
                        currentPage === item ? 'bg-accent text-on-accent' : 'text-ink-2 hover:bg-sunken'
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
                className="px-3 sm:px-4 py-2 text-sm font-medium text-ink-2 bg-raised border border-rule-strong rounded-lg hover:bg-sunken disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<TransactionEmptyIcon />}
          title={hasOtherFilters ? 'No matching transactions' : showingFuture ? 'No future transactions' : 'No transactions yet'}
          description={
            hasOtherFilters
              ? 'Try adjusting your filters'
              : showingFuture
                ? "You don't have any scheduled transactions right now."
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
            {undoSnapshot.had_attachments && <p className="text-xs text-ink-3">Attachments can’t be restored</p>}
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
