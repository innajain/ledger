import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { prisma } from '@/lib/prisma'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { get_transaction_status, get_cancellable_links } from '@/app/_utils/links'
import { create_transaction_core, update_transaction_core, delete_transaction_core } from '@/app/_core/transactions_core'
import { cancel_request_core } from '@/app/_core/approvals_core'
import type { ActionResult } from '@/app/_actions/_result'
import { money, fmt_date } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import { LineItemEditor } from '../components/LineItemEditor'
import { Confirm } from '../components/Field'
import { ActionFeedback } from '../components/ActionFeedback'
import type { ScreenProps } from '../types'

type Severity = 'error' | 'warning' | 'info' | null
type TxnRow = { id: string; date: string; desc: string; total: number; severity: Severity }
type Sort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
type Mode = 'list' | 'add' | 'edit' | 'detail' | 'deleting'

const SORT_LABELS: Record<Sort, string> = {
  date_desc: 'date ↓',
  date_asc: 'date ↑',
  amount_desc: 'amount ↓',
  amount_asc: 'amount ↑',
}
const SORT_CYCLE: Sort[] = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc']

function sev_symbol(s: Severity): string {
  if (s === 'error') return '✗'
  if (s === 'warning') return '⚠'
  if (s === 'info') return '○'
  return ''
}
function sev_color(s: Severity): string | undefined {
  if (s === 'error') return 'red'
  if (s === 'warning') return 'yellow'
  if (s === 'info') return 'cyan'
  return undefined
}

const columns: Column<TxnRow>[] = [
  { header: 'St', width: 3, cell: r => sev_symbol(r.severity), color: r => sev_color(r.severity) },
  { header: 'Date', width: 12, cell: r => r.date },
  { header: 'Description', width: 32, cell: r => r.desc },
  { header: 'Amount', width: 14, align: 'right', cell: r => money(r.total) },
]

export function Transactions({ uid, active, onExit }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [sort, setSort] = useState<Sort>('date_desc')
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)

  const { data: allRows, error } = useAsync<TxnRow[]>(async () => {
    const txns = await prisma.transaction.findMany({
      where: { user_id: uid },
      orderBy: { datetime: 'desc' },
      take: 500,
      include: {
        line_items: {
          select: { txn_value: true, quantity: true, accounting_head: { select: { type: true } } },
        },
      },
    })

    const txnIds = txns.map(t => t.id)
    const activeLinks = txnIds.length
      ? await prisma.transaction_link.findMany({
          where: {
            NOT: { pending_status: 'approved' },
            OR: [
              { user_a_id: uid, txn_a_id: { in: txnIds } },
              { user_b_id: uid, txn_b_id: { in: txnIds } },
            ],
          },
          select: { user_a_id: true, txn_a_id: true, txn_b_id: true, pending_status: true, pending_by: true },
        })
      : []

    const rank = { error: 2, warning: 1, info: 0 } as const
    const severityMap = new Map<string, Severity>()
    for (const link of activeLinks) {
      const txn_id = link.user_a_id === uid ? link.txn_a_id : link.txn_b_id
      if (!txn_id) continue
      const sev: NonNullable<Severity> =
        link.pending_status === 'rejected' && link.pending_by === uid
          ? 'error'
          : link.pending_status === 'pending' && link.pending_by === uid
            ? 'warning'
            : 'info'
      const existing = severityMap.get(txn_id)
      if (!existing || rank[sev] > rank[existing]) severityMap.set(txn_id, sev)
    }

    return txns.map(t => ({
      id: t.id,
      date: fmt_date(t.datetime),
      desc: t.description ?? '—',
      total: t.line_items
        .filter(li => li.accounting_head.type === 'account')
        .reduce((s, li) => s + ((li.txn_value ?? li.quantity)?.toNumber() ?? 0), 0),
      severity: severityMap.get(t.id) ?? null,
    }))
  }, [uid, reload])

  const rows = useMemo(() => {
    if (!allRows) return null
    let r = allRows
    if (search) {
      const lower = search.toLowerCase()
      r = r.filter(t => t.desc.toLowerCase().includes(lower))
    }
    return [...r].sort((a, b) => {
      switch (sort) {
        case 'date_asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime()
        case 'amount_asc':
          return a.total - b.total
        case 'amount_desc':
          return b.total - a.total
        default:
          return 0
      }
    })
  }, [allRows, search, sort])

  const [cursor] = useListNav(rows?.length ?? 0, active && mode === 'list' && !searching)
  const maxRows = useViewportRows()
  const selected = rows && rows.length > 0 ? rows[Math.min(cursor, rows.length - 1)] : null

  useInput(
    (input, key) => {
      if (searching) {
        if (key.escape) {
          setSearch('')
          setSearching(false)
        } else if (key.return) setSearching(false)
        else if (key.backspace || key.delete) setSearch(s => s.slice(0, -1))
        else if (input && !key.ctrl && !key.meta) setSearch(s => s + input)
        return
      }
      if (key.escape || key.leftArrow) return onExit()
      if (input === '/') {
        setSearching(true)
      } else if (input === 's') setSort(cur => SORT_CYCLE[(SORT_CYCLE.indexOf(cur) + 1) % SORT_CYCLE.length])
      else if (input === 'a') {
        setResult(null)
        setMode('add')
      } else if (input === 'e' && selected) setMode('edit')
      else if (input === 'd' && selected) setMode('deleting')
      else if (key.return && selected) setMode('detail')
    },
    { isActive: active && mode === 'list' },
  )

  const finish = (r: ActionResult<unknown>) => {
    setResult(r)
    if (r.success) setReload(n => n + 1)
    setMode('list')
  }

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading transactions…" />

  if (mode === 'add')
    return (
      <LineItemEditor
        uid={uid}
        title="New transaction"
        onDone={async p => finish(await create_transaction_core(uid, p.datetime, p.line_items, p.description))}
        onCancel={() => setMode('list')}
      />
    )
  if (mode === 'edit' && selected) return <EditTransaction uid={uid} id={selected.id} onDone={finish} onCancel={() => setMode('list')} />
  if (mode === 'detail' && selected) return <TransactionDetail uid={uid} id={selected.id} onClose={() => setMode('list')} />
  if (mode === 'deleting' && selected)
    return (
      <Confirm
        message={`Delete transaction "${selected.desc}"?`}
        onAnswer={async yes => (yes ? finish(await delete_transaction_core(uid, selected.id)) : setMode('list'))}
      />
    )

  const title = `Transactions (${SORT_LABELS[sort]})${search ? ` · /${search}` : ''}`
  return (
    <Panel title={title} color="yellow">
      {searching && (
        <Box marginBottom={1}>
          <Text color="yellow">/ </Text>
          <Text>{search}</Text>
          <Text color="gray">_ </Text>
          <Text color="gray" dimColor>
            enter confirm · esc clear
          </Text>
        </Box>
      )}
      {rows.length === 0 ? (
        <Empty label={search ? `No transactions matching "${search}".` : 'No transactions.'} />
      ) : (
        <DataTable columns={columns} rows={rows} selectedIndex={cursor} maxRows={maxRows} />
      )}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · a add · e edit · d delete · enter view · / search · s sort · esc menu
        </Text>
      </Box>
    </Panel>
  )
}

function EditTransaction({
  uid,
  id,
  onDone,
  onCancel,
}: {
  uid: string
  id: string
  onDone: (r: ActionResult<unknown>) => void
  onCancel: () => void
}) {
  const { data, error } = useAsync(async () => {
    const t = await prisma.transaction.findFirst({ where: { id, user_id: uid }, select: { description: true, datetime: true } })
    if (!t) throw new Error('Transaction not found')
    return t
  }, [uid, id])

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading transaction…" />

  return (
    <LineItemEditor
      uid={uid}
      title="Edit transaction — re-enter line items"
      initialDescription={data.description}
      initialDatetime={data.datetime}
      onDone={async p => onDone(await update_transaction_core(uid, id, p.line_items, p.datetime, p.description))}
      onCancel={onCancel}
    />
  )
}

type DetailRow = { type: string; head: string; asset: string; qty: string; value: string; note: string }

const detailColumns: Column<DetailRow>[] = [
  { header: 'Type', width: 14, cell: r => r.type },
  { header: 'Head', width: 20, cell: r => r.head },
  { header: 'Asset', width: 16, cell: r => r.asset },
  { header: 'Qty', width: 12, align: 'right', cell: r => r.qty },
  { header: 'Value', width: 14, align: 'right', cell: r => r.value },
  { header: 'Note', width: 18, cell: r => r.note },
]

function TransactionDetail({ uid, id, onClose }: { uid: string; id: string; onClose: () => void }) {
  const [cancelling, setCancelling] = useState(false)
  const [cancelResult, setCancelResult] = useState<ActionResult<unknown> | null>(null)

  const { data, error } = useAsync(async () => {
    const [raw, linkStatus, cancellable] = await Promise.all([
      prisma.transaction.findFirst({
        where: { id, user_id: uid },
        include: { line_items: { include: { accounting_head: true, asset: true } } },
      }),
      get_transaction_status(uid, id),
      get_cancellable_links(uid, id),
    ])
    if (!raw) throw new Error('Transaction not found')
    const t = normalize_txn(raw)
    const rows: DetailRow[] = t.line_items.map(li => ({
      type: li.accounting_head.type,
      head: li.accounting_head.name,
      asset: li.asset.name,
      qty: li.quantity.toString(),
      value: money(li.txn_value.toNumber()),
      note: li.description ?? '',
    }))
    const total = t.line_items.reduce((s, li) => s + (li.txn_value.toNumber() > 0 ? li.txn_value.toNumber() : 0), 0)
    return { date: fmt_date(t.datetime), description: t.description, rows, total, linkStatus, cancellable }
  }, [uid, id])

  useInput(async (input, key) => {
    if (cancelling) return
    if (key.escape || key.leftArrow || key.return) onClose()
    if (input === 'c' && data?.cancellable.length) {
      setCancelling(true)
      const results = await Promise.all(data.cancellable.map(l => cancel_request_core(uid, l.link_id)))
      const failed = results.find(r => !r.success)
      setCancelResult(failed ?? { success: true, message: 'Request cancelled' })
      setCancelling(false)
    }
  })

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading transaction…" />

  const sevColor = data.linkStatus
    ? ({ error: 'red', warning: 'yellow', info: 'cyan', success: 'green' } as Record<string, string>)[data.linkStatus.severity]
    : undefined

  return (
    <Panel title="Transaction detail" color="cyan">
      <Text>
        <Text color="gray">Date: </Text>
        {data.date}
        <Text color="gray"> Description: </Text>
        {data.description ?? '—'}
      </Text>
      {data.linkStatus && (
        <Box marginTop={1}>
          <Text color={sevColor}>{data.linkStatus.text}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <DataTable columns={detailColumns} rows={data.rows} />
      </Box>
      <Box marginTop={1}>
        <Text bold>Total: {money(data.total)}</Text>
      </Box>
      {cancelResult && (
        <Box marginTop={1}>
          <ActionFeedback result={cancelResult} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {cancelling ? 'Cancelling…' : data.cancellable.length ? 'esc/enter back · c cancel linked request' : 'esc / enter to go back'}
        </Text>
      </Box>
    </Panel>
  )
}
