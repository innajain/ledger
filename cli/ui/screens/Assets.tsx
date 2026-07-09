import React, { useState, useEffect, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { prisma } from '@/lib/prisma'
import { Prisma, asset_type } from '@/generated/prisma/client'
import { delete_asset_core } from '@/app/_core/resources_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_balances_core } from '@/app/_core/balances_core'
import { value_balance_entry } from '@/app/_utils/head_value'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import type { ActionResult } from '@/app/_actions/_result'
import { load_assets } from '../../shared'
import { money, qty } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import { Confirm } from '../components/Field'
import { ActionFeedback } from '../components/ActionFeedback'
import { AssetForm, type AssetEdit } from '../components/AssetForm'
import type { ScreenProps } from '../types'

type AssetRow = {
  id: string
  name: string
  type: asset_type
  ticker: string | null
  is_active: boolean
  quantity: number
  current_value: number
  xirr: number | null
}
type Mode = 'list' | 'add' | 'edit' | 'deleting' | 'detail'

const columns: Column<AssetRow>[] = [
  { header: 'Name', width: 20, cell: r => r.name },
  { header: 'Type', width: 10, cell: r => r.type },
  { header: 'Ticker', width: 12, cell: r => r.ticker ?? '—' },
  { header: 'Qty', width: 12, align: 'right', cell: r => qty(r.quantity) },
  { header: 'Value', width: 14, align: 'right', cell: r => money(r.current_value) },
  {
    header: 'XIRR',
    width: 10,
    align: 'right',
    cell: r => (r.xirr !== null ? `${(r.xirr * 100).toFixed(2)}%` : '—'),
    color: r => (r.xirr !== null ? (r.xirr >= 0 ? 'green' : 'red') : undefined),
  },
  { header: 'Active', width: 8, cell: r => (r.is_active ? 'Yes' : 'No'), color: r => (r.is_active ? 'green' : 'red') },
]

export function Assets({ uid, active, onExit, navContext }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)

  const { data, error } = useAsync(async () => {
    const [me, assets, { assetsToAccounts: balances }] = await Promise.all([
      prisma.user.findUnique({ where: { id: uid }, select: { is_admin: true } }),
      load_assets(),
      compute_balances_core(uid),
    ])

    const priceByAsset = await get_prices_for_assets(assets)
    const asset_ids = assets.map(a => a.id)
    const all_line_items = await prisma.line_item.findMany({
      where: { asset_id: { in: asset_ids }, accounting_head: { type: 'account' }, transaction: { user_id: uid } },
      include: { transaction: true },
    })
    const tx_ids = Array.from(new Set(all_line_items.map(li => li.transaction_id)))
    const normalizedById = new Map<string, { txn_value: Prisma.Decimal }>()
    if (tx_ids.length > 0) {
      const rawTxns = await prisma.transaction.findMany({
        where: { id: { in: tx_ids } },
        include: { line_items: { include: { accounting_head: true, asset: true } } },
      })
      for (const tx of rawTxns.map(normalize_txn)) {
        for (const li of tx.line_items) normalizedById.set(li.id, { txn_value: li.txn_value! })
      }
    }

    const rows: AssetRow[] = assets.map(ass => {
      const price = priceByAsset.get(ass.id)?.price ?? null
      const acc_qty_map = balances.get(ass.id) ?? new Map<string, { qty: number; txn_value: number }>()

      let total_qty = new Prisma.Decimal(0)
      let total_value = new Prisma.Decimal(0)
      for (const [, { qty, txn_value }] of acc_qty_map) {
        total_qty = total_qty.add(qty)
        total_value = total_value.add(value_balance_entry(qty, txn_value, price))
      }

      const assetLineItems = all_line_items.filter(li => li.asset_id === ass.id)
      const currentValue = total_value.toNumber()
      let xirr: number | null = null

      if (ass.type !== asset_type.rupees && assetLineItems.length > 0 && currentValue !== 0) {
        const cashflows: { amount: number; when: Date }[] = []
        for (const li of assetLineItems) {
          const n = normalizedById.get(li.id)
          if (!n) continue
          cashflows.push({ amount: -n.txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime })
        }
        cashflows.push({ amount: currentValue, when: new Date() })
        xirr = calculate_xirr(cashflows)
      }

      return {
        id: ass.id,
        name: ass.name,
        type: ass.type,
        ticker: ass.ticker,
        is_active: ass.is_active,
        quantity: total_qty.toNumber(),
        current_value: currentValue,
        xirr,
      }
    })

    return { isAdmin: !!me?.is_admin, rows }
  }, [uid, reload])

  const rows = useMemo(() => data?.rows ?? [], [data])
  const isAdmin = data?.isAdmin ?? false
  const [cursor, setCursor] = useListNav(rows.length, active && mode === 'list')
  const maxRows = useViewportRows()
  const sel = rows.length > 0 ? rows[Math.min(cursor, rows.length - 1)] : null

  useEffect(() => {
    if (navContext && rows.length > 0) {
      const idx = rows.findIndex(r => r.id === navContext)
      if (idx !== -1) {
        setCursor(idx)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode('detail')
      }
    }
  }, [navContext, rows, setCursor])

  const finish = (r: ActionResult<unknown>) => {
    setResult(r)
    if (r.success) setReload(n => n + 1)
    setMode('list')
  }

  useInput(
    (input, key) => {
      if (key.escape || key.leftArrow) {
        if (mode === 'list') {
          return onExit()
        }
      }
      if (key.return && sel) setMode('detail')
      if (!isAdmin) return
      if (input === 'a') {
        setResult(null)
        setMode('add')
      } else if (input === 'e' && sel) setMode('edit')
      else if (input === 'd' && sel) setMode('deleting')
    },
    { isActive: active && mode === 'list' },
  )

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading assets…" />

  if (mode === 'add') return <AssetForm onDone={finish} onCancel={() => setMode('list')} />
  if (mode === 'edit' && sel) {
    const edit: AssetEdit = { id: sel.id, name: sel.name, type: sel.type, ticker: sel.ticker, is_active: sel.is_active }
    return <AssetForm edit={edit} onDone={finish} onCancel={() => setMode('list')} />
  }
  if (mode === 'detail' && sel) return <AssetDetail uid={uid} assetId={sel.id} onClose={() => setMode('list')} />
  if (mode === 'deleting' && sel)
    return (
      <Confirm message={`Delete asset "${sel.name}"?`} onAnswer={async yes => (yes ? finish(await delete_asset_core(sel.id)) : setMode('list'))} />
    )

  return (
    <Panel title="Asset Catalog" color="blue">
      {rows.length === 0 ? <Empty label="No assets." /> : <DataTable columns={columns} rows={rows} selectedIndex={cursor} maxRows={maxRows} />}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {isAdmin ? '↑↓ move · a add · e edit · d delete · enter detail · esc menu' : 'enter detail · esc menu (assets are admin-managed)'}
        </Text>
      </Box>
    </Panel>
  )
}

type HoldingRow = { id: string; name: string; quantity: number; txn_value: number | null; current_value: number }
const holdingCols: Column<HoldingRow>[] = [
  { header: 'Name', width: 22, cell: r => r.name },
  { header: 'Qty', width: 12, align: 'right', cell: r => qty(r.quantity) },
  { header: 'Cost', width: 14, align: 'right', cell: r => (r.txn_value !== null ? money(r.txn_value) : '—') },
  { header: 'Value', width: 14, align: 'right', cell: r => money(r.current_value), color: r => (r.current_value < 0 ? 'red' : undefined) },
]

type LineItemRow = { id: string; acc: string; date: string; desc: string; qty: number; book: number; rem: number | null }
const liCols: Column<LineItemRow>[] = [
  { header: 'Date', width: 12, cell: r => r.date },
  { header: 'Account', width: 16, cell: r => r.acc },
  { header: 'Qty', width: 12, align: 'right', cell: r => qty(r.qty) },
  { header: 'Rem Qty', width: 12, align: 'right', cell: r => (r.rem !== null ? qty(r.rem) : '—') },
  { header: 'Cost', width: 14, align: 'right', cell: r => money(r.book) },
  { header: 'Desc', width: 20, cell: r => r.desc },
]

import { get_price_for_asset } from '@/app/_utils/price_fetcher'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { fetch_and_normalize_transactions } from '@/app/_utils/fetch_transactions'
import { fmt_date } from '../../format'

function AssetDetail({ uid, assetId, onClose }: { uid: string; assetId: string; onClose: () => void }) {
  useInput((_i, key) => {
    if (key.escape || key.leftArrow) onClose()
  })

  const { data, error } = useAsync(async () => {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        line_items: { where: { transaction: { user_id: uid } }, include: { accounting_head: true, transaction: true } },
        parent: true,
        children: true,
      },
    })
    if (!asset) throw new Error('Asset not found')

    const { normalizedById } = await fetch_and_normalize_transactions(asset.line_items)

    const real_line_items = asset.line_items.filter(li => li.accounting_head.type === 'account')
    const allocation_line_items = asset.line_items.filter(li => li.accounting_head.type === 'allocation')

    const priceResp = await get_price_for_asset(asset.type, asset.ticker ?? null)
    const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null

    let asset_total = new Prisma.Decimal(0)
    let book_total = new Prisma.Decimal(0)
    const acc_map: Record<string, { id: string; name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal }> = {}
    for (const li of real_line_items) {
      const n = normalizedById.get(li.id)!
      const aid = li.accounting_head.id
      if (!acc_map[aid])
        acc_map[aid] = { id: aid, name: li.accounting_head.name, total_qty: new Prisma.Decimal(0), total_book: new Prisma.Decimal(0) }
      acc_map[aid].total_qty = acc_map[aid].total_qty.add(n.quantity!)
      acc_map[aid].total_book = acc_map[aid].total_book.add(n.txn_value!)
    }

    const accountHoldings: HoldingRow[] = []
    for (const entry of Object.values(acc_map)) {
      book_total = book_total.add(entry.total_book)
      if (entry.total_qty.equals(0)) continue
      const current_value = compute_current_value(asset.type, entry.total_qty, priceDecimal, entry.total_book)
      asset_total = asset_total.add(current_value)
      accountHoldings.push({
        id: entry.id,
        name: entry.name,
        quantity: entry.total_qty.toNumber(),
        txn_value: entry.total_book.toNumber(),
        current_value: current_value.toNumber(),
      })
    }

    const alloc_map: Record<string, { id: string; name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal }> = {}
    for (const li of allocation_line_items) {
      const n = normalizedById.get(li.id)!
      const aid = li.accounting_head.id
      if (!alloc_map[aid])
        alloc_map[aid] = { id: aid, name: li.accounting_head.name, total_qty: new Prisma.Decimal(0), total_book: new Prisma.Decimal(0) }
      alloc_map[aid].total_qty = alloc_map[aid].total_qty.add(n.quantity!)
      alloc_map[aid].total_book = alloc_map[aid].total_book.add(n.txn_value!)
    }

    const allocHoldings: HoldingRow[] = []
    for (const entry of Object.values(alloc_map)) {
      if (entry.total_qty.equals(0)) continue
      const current_value = compute_current_value(asset.type, entry.total_qty, priceDecimal, entry.total_book)
      allocHoldings.push({
        id: entry.id,
        name: entry.name,
        quantity: entry.total_qty.toNumber(),
        txn_value: asset.type === asset_type.rupees ? null : entry.total_book.toNumber(),
        current_value: current_value.toNumber(),
      })
    }

    const items_with_meta = real_line_items.map(li => {
      const n = normalizedById.get(li.id)!
      return { li, qty: n.quantity!, book: n.txn_value!, sortDate: li.datetime ?? li.transaction.datetime }
    })

    const remaining_by_id =
      asset.type !== asset_type.rupees
        ? compute_fifo_remaining(
            items_with_meta.map(item => ({ id: item.li.id, group_key: item.li.accounting_head.id, qty: item.qty, date: item.sortDate })),
          )
        : new Map<string, Prisma.Decimal>()

    let current_investment = new Prisma.Decimal(0)
    for (const { li, qty, book } of items_with_meta) {
      if (qty.greaterThan(0)) {
        const remaining = remaining_by_id.get(li.id) ?? new Prisma.Decimal(0)
        if (remaining.greaterThan(0)) current_investment = current_investment.add(book.mul(remaining).div(qty))
      }
    }

    const lineItems: LineItemRow[] = items_with_meta
      .map(({ li, qty, book, sortDate }) => ({
        id: li.id,
        acc: li.accounting_head.name,
        date: fmt_date(sortDate),
        desc: li.description || li.transaction.description || '—',
        qty: qty.toNumber(),
        book: book.toNumber(),
        rem: remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null,
        _d: sortDate.getTime(),
      }))
      .sort((a, b) => b._d - a._d)

    let xirr: number | null = null
    if (asset.type !== asset_type.rupees && real_line_items.length > 0) {
      const cashflows = real_line_items.map(li => ({
        amount: -normalizedById.get(li.id)!.txn_value!.toNumber(),
        when: li.datetime ?? li.transaction.datetime,
      }))
      if (!asset_total.equals(0)) cashflows.push({ amount: asset_total.toNumber(), when: new Date() })
      xirr = calculate_xirr(cashflows)
    }

    return {
      name: asset.name,
      type: asset.type,
      ticker: asset.ticker,
      parent: asset.parent?.name ?? null,
      children: asset.children.map(c => c.name),
      price: priceDecimal?.toNumber() ?? null,
      xirr,
      total: asset_total.toNumber(),
      current_investment: asset.type === asset_type.rupees ? null : current_investment.toNumber(),
      txn_value_total: asset.type === asset_type.rupees ? null : book_total.toNumber(),
      accountHoldings,
      allocHoldings,
      lineItems,
    }
  }, [uid, assetId])

  const [liCursorIdx] = useListNav(data?.lineItems.length ?? 0, !!data)
  const maxRows = useViewportRows(24)

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading asset detail…" />

  return (
    <Box flexDirection="column">
      <Panel title={`${data.name} (${data.type})`} color="green">
        <Box gap={4}>
          <Text bold>
            Value: <Text color={data.total < 0 ? 'red' : 'green'}>{money(data.total)}</Text>
          </Text>
          {data.price !== null && (
            <Text>
              Price: <Text color="cyan">{data.price}</Text>
            </Text>
          )}
          {data.xirr !== null && (
            <Text>
              XIRR: <Text color="cyan">{(data.xirr * 100).toFixed(2)}%</Text>
            </Text>
          )}
        </Box>
        <Box gap={4}>
          {data.txn_value_total !== null && (
            <Text>
              Total Txn Value: <Text>{money(data.txn_value_total)}</Text>
            </Text>
          )}
          {data.current_investment !== null && (
            <Text>
              Current Investment: <Text>{money(data.current_investment)}</Text>
            </Text>
          )}
        </Box>
        {data.ticker && <Text color="gray">Ticker: {data.ticker}</Text>}
        {data.parent && <Text color="gray">Parent: {data.parent}</Text>}
        {data.children.length > 0 && <Text color="gray">Children: {data.children.join(', ')}</Text>}
      </Panel>

      {data.accountHoldings.length > 0 && (
        <Panel title="Holdings (by account)" color="blue">
          <DataTable columns={holdingCols} rows={data.accountHoldings} />
        </Panel>
      )}

      {data.allocHoldings.length > 0 && (
        <Panel title="Holdings (by allocation)" color="yellow">
          <DataTable columns={holdingCols} rows={data.allocHoldings} />
        </Panel>
      )}

      {data.lineItems.length > 0 && (
        <Panel title={`Line Items (${data.lineItems.length})`} color="magenta">
          <DataTable columns={liCols} rows={data.lineItems} selectedIndex={liCursorIdx} maxRows={maxRows} />
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
