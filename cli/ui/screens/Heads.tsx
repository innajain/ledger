import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { prisma } from '@/lib/prisma'
import { Prisma, asset_type } from '@/generated/prisma/client'
import type { accounting_head_type } from '@/generated/prisma/client'
import { delete_account_core } from '@/app/_core/resources_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import type { ActionResult } from '@/app/_actions/_result'
import { load_heads } from '../../shared'
import { money, qty, fmt_date } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import { Confirm } from '../components/Field'
import { ActionFeedback } from '../components/ActionFeedback'
import { HeadForm, type HeadEdit } from '../components/HeadForm'
import type { ScreenProps } from '../types'

type HeadRow = {
  id: string
  name: string
  type: accounting_head_type
  parent_id: string | null
  is_active: boolean
  parentName: string | null
  linkedName: string | null
}
type TypeFilter = 'all' | accounting_head_type
type Mode = 'list' | 'add' | 'edit' | 'detail' | 'deleting'

const TYPE_CYCLE: TypeFilter[] = ['all', 'account', 'allocation', 'income_expense']

const columns: Column<HeadRow>[] = [
  { header: 'Name', width: 22, cell: r => r.name },
  { header: 'Type', width: 15, cell: r => r.type },
  { header: 'Parent', width: 18, cell: r => r.parentName ?? '—' },
  { header: 'Linked', width: 14, cell: r => r.linkedName ?? '—', color: r => (r.linkedName ? 'cyan' : undefined) },
  { header: 'Active', width: 8, cell: r => (r.is_active ? 'Yes' : 'No'), color: r => (r.is_active ? 'green' : 'red') },
]

export function Heads({ uid, active, onExit }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const { data: allRows, error } = useAsync<HeadRow[]>(async () => {
    const heads = await load_heads(uid)
    const users = await prisma.user.findMany({ select: { id: true, username: true } })
    const userById = new Map(users.map(u => [u.id, u.username]))
    const nameById = new Map(heads.map(h => [h.id, h.name]))
    return heads.map(h => ({
      id: h.id,
      name: h.name,
      type: h.type,
      parent_id: h.parent_id,
      is_active: h.is_active,
      parentName: h.parent_id ? (nameById.get(h.parent_id) ?? null) : null,
      linkedName: h.linked_user_id ? (userById.get(h.linked_user_id) ?? null) : null,
    }))
  }, [uid, reload])

  const rows = useMemo(() => {
    if (!allRows) return null
    return typeFilter === 'all' ? allRows : allRows.filter(h => h.type === typeFilter)
  }, [allRows, typeFilter])

  const [cursor] = useListNav(rows?.length ?? 0, active && mode === 'list')
  const maxRows = useViewportRows()
  const sel = rows && rows.length > 0 ? rows[Math.min(cursor, rows.length - 1)] : null

  const finish = (r: ActionResult<unknown>) => {
    setResult(r)
    if (r.success) setReload(n => n + 1)
    setMode('list')
  }

  useInput(
    (input, key) => {
      if (key.escape || key.leftArrow) return onExit()
      if (input === 't') setTypeFilter(cur => TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % TYPE_CYCLE.length])
      else if (input === 'a') {
        setResult(null)
        setMode('add')
      } else if (input === 'e' && sel) setMode('edit')
      else if (input === 'd' && sel) setMode('deleting')
      else if (key.return && sel) setMode('detail')
    },
    { isActive: active && mode === 'list' },
  )

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading heads…" />

  if (mode === 'add') return <HeadForm uid={uid} onDone={finish} onCancel={() => setMode('list')} />
  if (mode === 'edit' && sel) {
    const edit: HeadEdit = { id: sel.id, name: sel.name, type: sel.type, parent_id: sel.parent_id, is_active: sel.is_active }
    return <HeadForm uid={uid} edit={edit} onDone={finish} onCancel={() => setMode('list')} />
  }
  if (mode === 'detail' && sel) return <HeadDetail uid={uid} head={sel} onClose={() => setMode('list')} />
  if (mode === 'deleting' && sel)
    return (
      <Confirm
        message={`Delete head "${sel.name}"?`}
        onAnswer={async yes => (yes ? finish(await delete_account_core(uid, sel.id)) : setMode('list'))}
      />
    )

  const title = `Accounting Heads${typeFilter !== 'all' ? ` · ${typeFilter}` : ''}`
  return (
    <Panel title={title} color="green">
      {rows.length === 0 ? <Empty label="No heads." /> : <DataTable columns={columns} rows={rows} selectedIndex={cursor} maxRows={maxRows} />}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · a add · e edit · d delete · enter detail · t filter type · esc menu
        </Text>
      </Box>
    </Panel>
  )
}

type BreakdownRow = { asset: string; asset_type: string; qty_num: number; cost: number; value: number; remaining: number | null }
type LiRow = { date: string; asset: string; qty_str: string; value: string; note: string }

const breakdownCols: Column<BreakdownRow>[] = [
  { header: 'Asset', width: 18, cell: r => r.asset },
  { header: 'Type', width: 8, cell: r => r.asset_type },
  { header: 'Qty', width: 12, align: 'right', cell: r => qty(r.qty_num) },
  { header: 'Remaining', width: 12, align: 'right', cell: r => (r.remaining !== null ? qty(r.remaining) : '—') },
  { header: 'Cost', width: 14, align: 'right', cell: r => money(r.cost) },
  { header: 'Value', width: 14, align: 'right', cell: r => money(r.value), color: r => (r.value < 0 ? 'red' : undefined) },
]

const liCols: Column<LiRow>[] = [
  { header: 'Date', width: 12, cell: r => r.date },
  { header: 'Asset', width: 16, cell: r => r.asset },
  { header: 'Qty', width: 12, align: 'right', cell: r => r.qty_str },
  { header: 'Value', width: 14, align: 'right', cell: r => r.value },
  { header: 'Note', width: 20, cell: r => r.note },
]

function HeadDetail({ uid, head, onClose }: { uid: string; head: HeadRow; onClose: () => void }) {
  useInput((_i, key) => {
    if (key.escape || key.leftArrow) onClose()
  })

  const { data, error } = useAsync(async () => {
    const h = await prisma.accounting_head.findFirst({
      where: { id: head.id, user_id: uid },
      include: {
        line_items: { include: { asset: true, transaction: true }, orderBy: { transaction: { datetime: 'desc' } } },
        parent: { select: { name: true } },
        children: { select: { id: true, name: true } },
      },
    })
    if (!h) throw new Error('Head not found')

    // Fetch + normalize full transactions to fill null-remainder quantities
    const txIds = Array.from(new Set(h.line_items.map(li => li.transaction_id)))
    const rawTxns = txIds.length
      ? await prisma.transaction.findMany({
          where: { id: { in: txIds } },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        })
      : []
    const normById = new Map<string, { quantity: Prisma.Decimal; txn_value: Prisma.Decimal }>()
    for (const tx of rawTxns.map(normalize_txn)) {
      for (const li of tx.line_items) normById.set(li.id, { quantity: li.quantity, txn_value: li.txn_value })
    }

    // Collect assets and prices
    const uniqueAssets = Array.from(new Map(h.line_items.map(li => [li.asset.id, li.asset])).values())
    const priceByAsset = await get_prices_for_assets(uniqueAssets)

    // Asset breakdown + XIRR cashflows
    const assetMap = new Map<string, { name: string; asset_type: asset_type; qty: Prisma.Decimal; cost: Prisma.Decimal }>()
    const cashflows: { amount: number; when: Date }[] = []
    let accTotal = new Prisma.Decimal(0)
    const fifoEntries: { id: string; group_key: string; qty: Prisma.Decimal; date: Date }[] = []

    for (const li of h.line_items) {
      const norm = normById.get(li.id)
      if (!norm) continue
      const { quantity: q, txn_value: v } = norm
      const priceDecimal = priceByAsset.get(li.asset_id) ? new Prisma.Decimal(priceByAsset.get(li.asset_id)!.price) : null
      const cur = compute_current_value(li.asset.type, q, priceDecimal, v)
      accTotal = accTotal.add(cur)
      cashflows.push({ amount: -v.toNumber(), when: li.datetime ?? li.transaction.datetime })
      if (!assetMap.has(li.asset_id))
        assetMap.set(li.asset_id, { name: li.asset.name, asset_type: li.asset.type, qty: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) })
      const e = assetMap.get(li.asset_id)!
      e.qty = e.qty.add(q)
      e.cost = e.cost.add(v)
      if (head.type === 'account' && li.asset.type !== asset_type.rupees)
        fifoEntries.push({ id: li.id, group_key: li.asset_id, qty: q, date: li.datetime ?? li.transaction.datetime })
    }

    // Sum FIFO remaining per asset
    const fifoRemaining = head.type === 'account' ? compute_fifo_remaining(fifoEntries) : new Map<string, Prisma.Decimal>()
    const fifoTotalByAsset = new Map<string, number>()
    for (const [liId, rem] of fifoRemaining) {
      const li = h.line_items.find(l => l.id === liId)
      if (li) fifoTotalByAsset.set(li.asset_id, (fifoTotalByAsset.get(li.asset_id) ?? 0) + rem.toNumber())
    }

    const breakdown: BreakdownRow[] = []
    for (const [assetId, e] of assetMap) {
      if (e.qty.abs().lessThan(1e-9) && e.cost.abs().lessThan(1e-9)) continue
      const priceData = priceByAsset.get(assetId)
      const value = compute_current_value(e.asset_type, e.qty, priceData ? new Prisma.Decimal(priceData.price) : null, e.cost)
      breakdown.push({
        asset: e.name,
        asset_type: e.asset_type,
        qty_num: e.qty.toNumber(),
        cost: e.cost.toNumber(),
        value: value.toNumber(),
        remaining: fifoTotalByAsset.has(assetId) ? (fifoTotalByAsset.get(assetId) ?? 0) : null,
      })
    }
    breakdown.sort((a, b) => b.value - a.value)

    // XIRR (accounts only)
    let xirr: number | null = null
    if (head.type === 'account' && cashflows.length > 0 && !accTotal.equals(0)) {
      cashflows.push({ amount: accTotal.toNumber(), when: new Date() })
      xirr = calculate_xirr(cashflows)
    }

    // Line items for display (already ordered desc by transaction date)
    const liRows: LiRow[] = h.line_items.map(li => {
      const norm = normById.get(li.id)
      return {
        date: fmt_date(li.datetime ?? li.transaction.datetime),
        asset: li.asset.name,
        qty_str: norm ? qty(norm.quantity.toNumber()) : '—',
        value: norm ? money(norm.txn_value.toNumber()) : '—',
        note: li.transaction.description ?? li.description ?? '—',
      }
    })

    return {
      total: accTotal.toNumber(),
      xirr,
      breakdown,
      liRows,
      parent: h.parent?.name ?? null,
      children: h.children.map(c => c.name),
    }
  }, [uid, head.id])

  const [liCursorIdx] = useListNav(data?.liRows.length ?? 0, !!data)
  const maxRows = useViewportRows(16)

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading head detail…" />

  return (
    <Box flexDirection="column">
      <Panel title={`${head.name} (${head.type})`} color="green">
        <Box gap={4}>
          <Text bold>
            Total: <Text color={data.total < 0 ? 'red' : 'green'}>{money(data.total)}</Text>
          </Text>
          {data.xirr !== null && (
            <Text>
              XIRR: <Text color="cyan">{(data.xirr * 100).toFixed(2)}%</Text>
            </Text>
          )}
        </Box>
        {data.parent && <Text color="gray">Parent: {data.parent}</Text>}
        {data.children.length > 0 && <Text color="gray">Children: {data.children.join(', ')}</Text>}
        {head.linkedName && <Text color="cyan">Linked user: @{head.linkedName}</Text>}
      </Panel>

      {data.breakdown.length > 0 && (
        <Panel title="Asset breakdown" color="blue">
          <DataTable columns={breakdownCols} rows={data.breakdown} />
        </Panel>
      )}

      {data.liRows.length > 0 && (
        <Panel title={`Line items (${data.liRows.length})`} color="magenta">
          <DataTable columns={liCols} rows={data.liRows} selectedIndex={liCursorIdx} maxRows={maxRows} />
        </Panel>
      )}

      <Box>
        <Text color="gray" dimColor>
          ↑↓ scroll line items · esc to go back
        </Text>
      </Box>
    </Box>
  )
}
