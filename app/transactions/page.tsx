import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { get_line_item_qty } from '../_utils/validate_line_items'

export const metadata: Metadata = {
  title: 'Transactions',
  description: 'View and manage all your financial transactions',
}

export default async function Page({
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
  const dateFrom = params.dateFrom ? new Date(params.dateFrom) : undefined
  const dateTo = params.dateTo ? new Date(params.dateTo) : undefined
  const minAmount = params.minAmount ? parseFloat(params.minAmount) : undefined
  const maxAmount = params.maxAmount ? parseFloat(params.maxAmount) : undefined
  const accountId = params.accountId || undefined
  const assetId = params.assetId || undefined

  // Fetch accounts and assets for filter dropdowns
  const [accounts, assets] = await Promise.all([
    prisma.account.findMany({
      where: { user_id: user.id },
      orderBy: { name: 'asc' },
    }),
    prisma.asset.findMany({
      where: { user_id: user.id },
      orderBy: { name: 'asc' },
    }),
  ])

  // Build where clause
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
    ...(dateFrom && { datetime: { gte: dateFrom } }),
    ...(dateTo && { datetime: { lte: dateTo } }),
    ...(accountId && { line_items: { some: { account_id: accountId } } }),
    ...(assetId && { line_items: { some: { asset_id: assetId } } }),
  }

  // Get total count first
  const totalCount = await prisma.transaction.count({ where })

  // Calculate page size (handle ALL option)
  const page = parseInt(params.page || '1')
  const pageSizeParam = params.pageSize
  const pageSize = pageSizeParam === 'all' ? totalCount : parseInt(pageSizeParam || '20')

  // Fetch paginated transactions
  const transactions = await prisma.transaction.findMany({
    where,
    include: { line_items: { include: { asset: true, account: true } } },
    orderBy: { datetime: 'desc' },
    skip: pageSizeParam === 'all' ? 0 : (page - 1) * pageSize,
    take: pageSizeParam === 'all' ? undefined : pageSize,
  })

  const txForClient = transactions.map(t => {
    const total = t.line_items
      .filter(li => li.account.type === 'real')
      .reduce((s, li) => s.add(li.book_value ? li.book_value : get_line_item_qty({ ...li, transaction: t })), new Prisma.Decimal(0))
      .toNumber()
    return {
      id: t.id,
      date: t.datetime,
      description: t.description,
      total_book: total,
    }
  })

  // Filter by amount if specified (done client-side as it depends on calculation)
  const filteredTx = txForClient.filter(tx => {
    if (minAmount !== undefined && tx.total_book < minAmount) return false
    if (maxAmount !== undefined && tx.total_book > maxAmount) return false
    return true
  })

  return (
    <ClientPage
      transactions={filteredTx}
      totalCount={totalCount}
      currentPage={page}
      pageSize={pageSize}
      searchParams={params}
      accounts={accounts}
      assets={assets}
    />
  )
}
