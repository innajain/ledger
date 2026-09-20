import { prisma } from '@/lib/prisma'
import { get_current_user } from '@/app/_actions/auth'
import ClientPage from './ClientPage'
import { Prisma } from '@/generated/prisma/client'
import type { Metadata } from 'next'
import { fromZonedTime } from 'date-fns-tz'
import { normalize_line_items } from '../_utils/normalize_txn'
import { is_future_txn_due } from '../_utils/future_txn'
import { USER_TIMEZONE } from '@/lib/config'

import { get_transaction_templates } from '@/app/_actions/templates'
import { list_group_names_core, groups_for_transactions_core } from '@/app/_core/groups_core'
import { profile } from '@/lib/metrics/profile'
import { LoggedOutNotice } from '@/app/_components/LoggedOutNotice'

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
  description: 'Search, filter and post transactions',
}

type TxForClient = {
  id: string
  date: Date
  description: string | null
  total_book: number
  link_severity: 'error' | 'warning' | 'info' | null
  /** Scheduled for today (IST) or earlier — only ever true on the future list. */
  is_due: boolean
  /** The user's own labels on this transaction (see /groups). */
  groups: { id: string; name: string }[]
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
    future?: string
    groupId?: string
  }>
}) {
  const user = await get_current_user()
  if (!user) {
    return <LoggedOutNotice title="Transactions" />
  }

  const params = await searchParams
  const search = params.search || ''

  const dateFrom = params.dateFrom ? istDayStart(params.dateFrom, 0) : undefined
  const dateTo = params.dateTo ? istDayStart(params.dateTo, 1) : undefined
  const minAmount = params.minAmount ? parseFloat(params.minAmount) : undefined
  const maxAmount = params.maxAmount ? parseFloat(params.maxAmount) : undefined
  const accountId = params.accountId || undefined
  const assetId = params.assetId || undefined
  const groupId = params.groupId || undefined
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(params.sort ?? '') ? (params.sort as SortKey) : 'date_desc'
  // Real transactions by default, matching the transactions-only view every other
  // balance/list surface in the app already defaults to; 'future' flips to the
  // scheduled/draft set instead of mixing the two.
  const showFuture = params.future === 'future'

  // The client's filter dropdowns only read id+name; full rows would be serialized
  // into the RSC payload for nothing.
  const [accounts, assets, templates, groups] = await Promise.all([
    prisma.accounting_head.findMany({
      where: { user_id: user.id },
      select: { id: true, name: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    prisma.asset.findMany({
      select: { id: true, name: true },
      orderBy: [{ order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    }),
    get_transaction_templates(),
    list_group_names_core(user.id),
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
  if (groupId) lineItemFilters.push({ group_members: { some: { group_id: groupId } } })

  const where: Prisma.transactionWhereInput = {
    user_id: user.id,
    is_future: showFuture,
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

  // Narrow select: totals only need normalized txn_value + head type, not full
  // asset/head rows per line item.
  const list_select = {
    id: true,
    datetime: true,
    description: true,
    line_items: {
      select: {
        quantity: true,
        txn_value: true,
        accounting_head: { select: { type: true } },
        asset: { select: { id: true, type: true, name: true } },
      },
    },
  } satisfies Prisma.transactionSelect

  type ListRow = Prisma.transactionGetPayload<{ select: typeof list_select }>

  // One `now` for the whole page, so two rows either side of an IST midnight can't
  // disagree about what "today" is (same rule as the home card).
  const now = new Date()
  const toClientRow = (t: ListRow): TxForClient => {
    const normalized = normalize_line_items(t.line_items)
    return {
      id: t.id,
      date: t.datetime,
      description: t.description,
      total_book: normalized
        .filter(li => li.accounting_head.type === 'account')
        .reduce((s, li) => s.add(li.txn_value), new Prisma.Decimal(0))
        .toNumber(),
      link_severity: null as TxForClient['link_severity'],
      // Filled in one batched query below, once the page's rows are known.
      groups: [] as TxForClient['groups'],
      // Only the future list can have due rows; a real transaction is always in the past.
      is_due: showFuture && is_future_txn_due(t.datetime, now),
    }
  }

  const needsScan = minAmount !== undefined || maxAmount !== undefined || sort === 'amount_desc' || sort === 'amount_asc'

  let totalCount: number
  let txForClient: TxForClient[]
  let pageSize: number

  if (!needsScan) {
    const orderBy = { datetime: sort === 'date_asc' ? ('asc' as const) : ('desc' as const) }
    const [count, rawTransactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        select: list_select,
        orderBy,
        skip: wantsAll ? 0 : (page - 1) * requestedPageSize,
        take: wantsAll ? undefined : requestedPageSize,
      }),
    ])
    totalCount = count
    pageSize = wantsAll ? totalCount : requestedPageSize
    txForClient = rawTransactions.map(toClientRow)
  } else {
    // Amount filter/sort in SQL. The book total per transaction is
    // SUM(COALESCE(txn_value, quantity)) over its account-type lines: validation
    // guarantees account lines always store quantity, non-rupee account lines always
    // store txn_value, and normalization sets txn_value = quantity for rupee lines —
    // so the stored columns reproduce the normalized total without fetching a single
    // line item. This used to pull up to 5000 transactions (with every line item) into
    // JS, and silently capped the count there.
    const like = (s: string) => '%' + s.replace(/[\\%_]/g, m => '\\' + m) + '%'
    const conds: Prisma.Sql[] = [Prisma.sql`t.user_id = ${user.id}`, Prisma.sql`t.is_future = ${showFuture}`]
    if (search) {
      conds.push(
        Prisma.sql`(t.description ILIKE ${like(search)} OR EXISTS (SELECT 1 FROM line_item s WHERE s.transaction_id = t.id AND s.description ILIKE ${like(search)}))`,
      )
    }
    if (dateFrom) conds.push(Prisma.sql`t.datetime >= ${dateFrom}`)
    if (dateTo) conds.push(Prisma.sql`t.datetime < ${dateTo}`)
    if (accountId) conds.push(Prisma.sql`EXISTS (SELECT 1 FROM line_item a WHERE a.transaction_id = t.id AND a.accounting_head_id = ${accountId})`)
    if (assetId) conds.push(Prisma.sql`EXISTS (SELECT 1 FROM line_item b WHERE b.transaction_id = t.id AND b.asset_id = ${assetId})`)
    if (groupId)
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM transaction_group_member gm WHERE gm.transaction_id = t.id AND gm.group_id = ${groupId})`)

    const totalExpr = Prisma.sql`COALESCE(SUM(COALESCE(li.txn_value, li.quantity)), 0)`
    const having: Prisma.Sql[] = []
    if (minAmount !== undefined) having.push(Prisma.sql`${totalExpr} >= ${minAmount}`)
    if (maxAmount !== undefined) having.push(Prisma.sql`${totalExpr} <= ${maxAmount}`)

    // LEFT JOIN of the (line_item ⋈ account-head) pair keeps transactions with no
    // account lines in the result with a total of 0, matching the old JS behavior.
    const grouped = Prisma.sql`
      SELECT t.id, ${totalExpr} AS total
      FROM "transaction" t
      LEFT JOIN (line_item li JOIN accounting_head ah ON ah.id = li.accounting_head_id AND ah.type = 'account')
        ON li.transaction_id = t.id
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY t.id
      ${having.length > 0 ? Prisma.sql`HAVING ${Prisma.join(having, ' AND ')}` : Prisma.empty}
    `
    const orderSql =
      sort === 'amount_asc'
        ? Prisma.sql`ORDER BY total ASC, t.id`
        : sort === 'amount_desc'
          ? Prisma.sql`ORDER BY total DESC, t.id`
          : sort === 'date_asc'
            ? Prisma.sql`ORDER BY t.datetime ASC, t.id`
            : Prisma.sql`ORDER BY t.datetime DESC, t.id`
    const limitSql = wantsAll ? Prisma.empty : Prisma.sql`LIMIT ${requestedPageSize} OFFSET ${(page - 1) * requestedPageSize}`

    const [pageRows, countRows] = await Promise.all([
      prisma.$queryRaw<{ id: string }[]>(Prisma.sql`${grouped} ${orderSql} ${limitSql}`),
      prisma.$queryRaw<{ count: number }[]>(Prisma.sql`SELECT COUNT(*)::int AS count FROM (${grouped}) sub`),
    ])

    totalCount = countRows[0]?.count ?? 0
    pageSize = wantsAll ? totalCount : requestedPageSize
    if (pageRows.length === 0) {
      txForClient = []
    } else {
      const pageRaw = await prisma.transaction.findMany({
        where: { id: { in: pageRows.map(r => r.id) }, user_id: user.id },
        select: list_select,
      })
      const byId = new Map(pageRaw.map(t => [t.id, toClientRow(t)]))
      txForClient = pageRows.map(r => byId.get(r.id)).filter((t): t is TxForClient => !!t)
    }
  }

  if (txForClient.length > 0) {
    const txIds = txForClient.map(t => t.id)
    const groupsByTxn = await groups_for_transactions_core(user.id, txIds)
    txForClient = txForClient.map(t => ({ ...t, groups: groupsByTxn.get(t.id) ?? [] }))
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
      groups={groups}
      templates={templatesForClient}
    />
  )
}

export default profile('/transactions', Page)
