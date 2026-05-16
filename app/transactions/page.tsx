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

// Convert a YYYY-MM-DD string into a UTC Date representing midnight on that day in IST.
// Used for date-range filter bounds: pass dateFrom directly, pass (dateTo + 1 day) for exclusive upper bound.
function istDayStart(dateStr: string, addDays = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  // Construct an IST-zoned wall-clock date, then convert to UTC.
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
}

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
  // dateFrom: midnight (IST) on that day. dateTo: midnight (IST) on the *next* day, used with `lt` so the picked day is included.
  const dateFrom = params.dateFrom ? istDayStart(params.dateFrom, 0) : undefined
  const dateTo = params.dateTo ? istDayStart(params.dateTo, 1) : undefined
  const minAmount = params.minAmount ? parseFloat(params.minAmount) : undefined
  const maxAmount = params.maxAmount ? parseFloat(params.maxAmount) : undefined
  const accountId = params.accountId || undefined
  const assetId = params.assetId || undefined

  // Fetch accounts and assets for filter dropdowns
  const [accounts, assets, templates] = await Promise.all([
    prisma.account.findMany({
      where: { user_id: user.id },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany({
      where: { user_id: user.id },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_transaction_templates(),
  ])

  const templatesForClient = templates.map(t => ({
    id: t.id,
    description: t.description,
    line_items: t.line_items.map(li => ({
      id: li.id,
      account_id: li.account_id,
      asset_id: li.asset_id,
      description: li.description,
      quantity: li.quantity ? Number(li.quantity) : null,
      txn_value: li.txn_value ? Number(li.txn_value) : null,
      account: li.account,
      asset: li.asset,
    })),
  }))

  const lineItemFilters: Prisma.transactionWhereInput[] = []
  if (accountId) lineItemFilters.push({ line_items: { some: { account_id: accountId } } })
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

  const baseQuery = {
    where,
    include: { line_items: { include: { asset: true, account: true } } },
    orderBy: { datetime: 'desc' as const },
  }

  const txTotal = (t: { line_items: { account: { type: string }; txn_value: Prisma.Decimal | null }[] }) =>
    t.line_items
      .filter(li => li.account.type === 'real')
      .reduce((s, li) => s.add(li.txn_value!), new Prisma.Decimal(0))
      .toNumber()

  let totalCount: number
  let txForClient: TxForClient[]
  let pageSize: number

  if (minAmount === undefined && maxAmount === undefined) {
    // Fast path: SQL-side pagination, count via prisma.count
    totalCount = await prisma.transaction.count({ where })
    pageSize = wantsAll ? totalCount : requestedPageSize
    const rawTransactions = await prisma.transaction.findMany({
      ...baseQuery,
      skip: wantsAll ? 0 : (page - 1) * pageSize,
      take: wantsAll ? undefined : pageSize,
    })
    const transactions = rawTransactions.map(normalize_txn)
    txForClient = transactions.map(t => ({
      id: t.id,
      date: t.datetime,
      description: t.description,
      total_book: txTotal(t),
    }))
  } else {
    // Filter path: total depends on aggregation, can't paginate at SQL level.
    // Fetch up to AMOUNT_FILTER_SCAN_CAP matching, normalize, filter on amount, then slice in memory.
    const AMOUNT_FILTER_SCAN_CAP = 5000
    const allRaw = await prisma.transaction.findMany({ ...baseQuery, take: AMOUNT_FILTER_SCAN_CAP })
    const all = allRaw.map(normalize_txn)
    const allWithTotals: TxForClient[] = all.map(t => ({
      id: t.id,
      date: t.datetime,
      description: t.description,
      total_book: txTotal(t),
    }))
    const filtered = allWithTotals.filter(tx => {
      if (minAmount !== undefined && tx.total_book < minAmount) return false
      if (maxAmount !== undefined && tx.total_book > maxAmount) return false
      return true
    })
    totalCount = filtered.length
    pageSize = wantsAll ? totalCount : requestedPageSize
    txForClient = wantsAll ? filtered : filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
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
