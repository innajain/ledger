import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { fromZonedTime } from 'date-fns-tz'
import { normalize_txn } from '../_utils/normalize_txn'
import { USER_TIMEZONE } from '@/lib/config'

import { get_transaction_templates } from '@/app/_actions/templates'
import { profile } from '@/lib/metrics/profile'

function istDayStart(dateStr: string, addDays = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number)

  const wall = new Date(Date.UTC(y, m - 1, d + addDays))
  const yyyy = wall.getUTCFullYear()
  const mm = String(wall.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(wall.getUTCDate()).padStart(2, '0')
  return fromZonedTime(`${yyyy}-${mm}-${dd}T00:00:00`, USER_TIMEZONE)
}

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'View and manage all your financial transactions',
}

type TxForClient = {
  id: string
  date: Date
  description: string | null
  total_book: number
  link_severity: 'error' | 'warning' | 'info' | null
}

const SORT_KEYS = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'] as const
type SortKey = (typeof SORT_KEYS)[number]

async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string
    search?: string
    dateFrom?: string
    dateTo?: string
    minAmount?: string
    maxAmount?: string
    pageSize?: string
    accountId?: string
    assetId?: string
    sort?: string
  }>
}) {
  const user = await get_current_user()
  if (!user) {
    return (
      <div>
        <h1>Transactions</h1>
        <p>Please log in to view transactions.</p>
      </div>
    )
  }

  const params = await searchParams
  const search = params.search || ''

  const dateFrom = params.dateFrom ? istDayStart(params.dateFrom, 0) : undefined
  const dateTo = params.dateTo ? istDayStart(params.dateTo, 1) : undefined
  const minAmount = params.minAmount ? parseFloat(params.minAmount) : undefined
  const maxAmount = params.maxAmount ? parseFloat(params.maxAmount) : undefined
  const accountId = params.accountId || undefined
  const assetId = params.assetId || undefined
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(params.sort ?? '') ? (params.sort as SortKey) : 'date_desc'

  const [accounts, assets, templates] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany({
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_transaction_templates(),
  ])

  const templatesForClient = templates.map(t => ({
    id: t.id,
    description: t.description,
    line_items: t.line_items.map(li => ({
      id: li.id,
      accounting_head_id: li.accounting_head_id,
      asset_id: li.asset_id,
      description: li.description,
      quantity: li.quantity ? Number(li.quantity) : null,
      txn_value: li.txn_value ? Number(li.txn_value) : null,
      accounting_head: li.accounting_head,
      asset: li.asset,
    })),
  }))

  const lineItemFilters: Prisma.transactionWhereInput[] = []
  if (accountId) lineItemFilters.push({ line_items: { some: { accounting_head_id: accountId } } })
  if (assetId) lineItemFilters.push({ line_items: { some: { asset_id: assetId } } })

  const where: Prisma.transactionWhereInput = {
    user_id: user.id,
    ...(search && {
      OR: [
        {
          description: {
            contains: search,
            mode: 'insensitive' as Prisma.QueryMode,
          },
        },
        {
          line_items: {
            some: {
              description: {
                contains: search,
                mode: 'insensitive' as Prisma.QueryMode,
              },
            },
          },
        },
      ],
    }),
    ...((dateFrom || dateTo) && {
      datetime: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lt: dateTo }),
      },
    }),
    ...(lineItemFilters.length > 0 && { AND: lineItemFilters }),
  }

  const page = parseInt(params.page || '1')
  const pageSizeParam = params.pageSize
  const requestedPageSize = pageSizeParam === 'all' ? Infinity : parseInt(pageSizeParam || '20')
  const wantsAll = pageSizeParam === 'all'

  const txTotal = (t: { line_items: { accounting_head: { type: string }; txn_value: Prisma.Decimal | null }[] }) =>
    t.line_items
      .filter(li => li.accounting_head.type === 'account')
      .reduce((s, li) => s.add(li.txn_value!), new Prisma.Decimal(0))
      .toNumber()

  const needsScan = minAmount !== undefined || maxAmount !== undefined || sort === 'amount_desc' || sort === 'amount_asc'

  let totalCount: number
  let txForClient: TxForClient[]
  let pageSize: number

  if (!needsScan) {
    const orderBy = { datetime: sort === 'date_asc' ? ('asc' as const) : ('desc' as const) }
    totalCount = await prisma.transaction.count({ where })
    pageSize = wantsAll ? totalCount : requestedPageSize
    const rawTransactions = await prisma.transaction.findMany({
      where,
      include: { line_items: { include: { asset: true, accounting_head: true } } },
      orderBy,
      skip: wantsAll ? 0 : (page - 1) * pageSize,
      take: wantsAll ? undefined : pageSize,
    })
    const transactions = rawTransactions.map(normalize_txn)
    txForClient = transactions.map(t => ({
      id: t.id,
      date: t.datetime,
      description: t.description,
      total_book: txTotal(t),
      link_severity: null as TxForClient['link_severity'],
    }))
  } else {
    const AMOUNT_FILTER_SCAN_CAP = 5000
    const allRaw = await prisma.transaction.findMany({
      where,
      include: { line_items: { include: { asset: true, accounting_head: true } } },
      orderBy: { datetime: 'desc' as const },
      take: AMOUNT_FILTER_SCAN_CAP,
    })
    const all = allRaw.map(normalize_txn)
    const allWithTotals: TxForClient[] = all.map(t => ({
      id: t.id,
      date: t.datetime,
      description: t.description,
      total_book: txTotal(t),
      link_severity: null as TxForClient['link_severity'],
    }))
    const filtered = allWithTotals.filter(tx => {
      if (minAmount !== undefined && tx.total_book < minAmount) return false
      if (maxAmount !== undefined && tx.total_book > maxAmount) return false
      return true
    })
    filtered.sort((a, b) => {
      switch (sort) {
        case 'date_asc':
          return a.date.getTime() - b.date.getTime()
        case 'amount_asc':
          return a.total_book - b.total_book
        case 'amount_desc':
          return b.total_book - a.total_book
        case 'date_desc':
        default:
          return b.date.getTime() - a.date.getTime()
      }
    })
    totalCount = filtered.length
    pageSize = wantsAll ? totalCount : requestedPageSize
    txForClient = wantsAll ? filtered : filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
  }

  if (txForClient.length > 0) {
    const txIds = txForClient.map(t => t.id)
    const activeLinks = await prisma.transaction_link.findMany({
      where: {
        OR: [
          { user_a_id: user.id, txn_a_id: { in: txIds } },
          { user_b_id: user.id, txn_b_id: { in: txIds } },
        ],
        NOT: { pending_status: 'approved' },
      },
      select: { user_a_id: true, txn_a_id: true, txn_b_id: true, pending_status: true, pending_by: true },
    })
    const rank = { error: 2, warning: 1, info: 0 } as const
    const severityMap = new Map<string, TxForClient['link_severity']>()
    for (const link of activeLinks) {
      const txn_id = link.user_a_id === user.id ? link.txn_a_id : link.txn_b_id
      if (!txn_id) continue
      const sev: NonNullable<TxForClient['link_severity']> =
        link.pending_status === 'rejected' && link.pending_by === user.id
          ? 'error'
          : link.pending_status === 'pending' && link.pending_by === user.id
            ? 'warning'
            : 'info'
      const existing = severityMap.get(txn_id)
      if (!existing || rank[sev] > rank[existing]) severityMap.set(txn_id, sev)
    }
    txForClient = txForClient.map(t => ({ ...t, link_severity: severityMap.get(t.id) ?? null }))
  }

  return (
    <ClientPage
      transactions={txForClient}
      totalCount={totalCount}
      currentPage={page}
      pageSize={pageSize}
      searchParams={params}
      accounts={accounts}
      assets={assets}
      templates={templatesForClient}
    />
  )
}

export default profile('/transactions', Page)
