import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { prisma } from '@/lib/prisma'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { create_transaction_core, update_transaction_core, delete_transaction_core } from '@/app/_core/transactions_core'
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

type TxnRow = { id: string; date: string; desc: string; total: number }
type Mode = 'list' | 'add' | 'edit' | 'detail' | 'deleting'

const columns: Column<TxnRow>[] = [
  { header: 'Date', width: 12, cell: r => r.date },
  { header: 'Description', width: 36, cell: r => r.desc },
  { header: 'Amount', width: 16, align: 'right', cell: r => money(r.total) },
]

export function Transactions({ uid, active, onExit }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)

  const { data: rows, error } = useAsync<TxnRow[]>(async () => {
    const txns = await prisma.transaction.findMany({
      where: { user_id: uid },
      orderBy: { datetime: 'desc' },
      take: 30,
      include: { line_items: { select: { txn_value: true } } },
    })
    return txns.map(t => ({
      id: t.id,
      date: fmt_date(t.datetime),
      desc: t.description ?? '—',
      total: t.line_items.reduce((s, li) => s + (li.txn_value && li.txn_value.toNumber() > 0 ? li.txn_value.toNumber() : 0), 0),
    }))
  }, [uid, reload])

  const [cursor] = useListNav(rows?.length ?? 0, active && mode === 'list')
  const maxRows = useViewportRows()
  const selected = rows && rows.length > 0 ? rows[Math.min(cursor, rows.length - 1)] : null

  useInput(
    (input, key) => {
      if (key.escape || key.leftArrow) return onExit()
      if (input === 'a') {
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

  return (
    <Panel title="Transactions" color="yellow">
      {rows.length === 0 ? <Empty label="No transactions." /> : <DataTable columns={columns} rows={rows} selectedIndex={cursor} maxRows={maxRows} />}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · a add · e edit · d delete · enter view · esc menu
        </Text>
      </Box>
    </Panel>
  )
}

/** Load a transaction's current description/date, then re-enter its line items. */
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

/** Drill-in: a transaction's full line items (Enter on a row). */
function TransactionDetail({ uid, id, onClose }: { uid: string; id: string; onClose: () => void }) {
  useInput((_input, key) => {
    if (key.escape || key.leftArrow || key.return) onClose()
  })

  const { data, error } = useAsync(async () => {
    const raw = await prisma.transaction.findFirst({
      where: { id, user_id: uid },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    })
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
    return { date: fmt_date(t.datetime), description: t.description, rows, total }
  }, [uid, id])

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading transaction…" />

  return (
    <Panel title="Transaction detail" color="cyan">
      <Text>
        <Text color="gray">Date: </Text>
        {data.date}
        <Text color="gray"> Description: </Text>
        {data.description ?? '—'}
      </Text>
      <Box marginTop={1}>
        <DataTable columns={detailColumns} rows={data.rows} />
      </Box>
      <Box marginTop={1}>
        <Text bold>Total: {money(data.total)}</Text>
      </Box>
      <Text color="gray" dimColor>
        esc / enter to go back
      </Text>
    </Panel>
  )
}
