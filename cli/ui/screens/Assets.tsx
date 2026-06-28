import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { prisma } from '@/lib/prisma'
import type { asset_type } from '@/generated/prisma/client'
import { delete_asset_core } from '@/app/_core/resources_core'
import type { ActionResult } from '@/app/_actions/_result'
import { load_assets } from '../../shared'
import { useAsync } from '../hooks/useAsync'
import { useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import { Confirm } from '../components/Field'
import { ActionFeedback } from '../components/ActionFeedback'
import { AssetForm, type AssetEdit } from '../components/AssetForm'
import type { ScreenProps } from '../types'

type AssetRow = { id: string; name: string; type: asset_type; ticker: string | null; is_active: boolean }
type Mode = 'list' | 'add' | 'edit' | 'deleting'

const columns: Column<AssetRow>[] = [
  { header: 'Name', width: 24, cell: r => r.name },
  { header: 'Type', width: 10, cell: r => r.type },
  { header: 'Ticker', width: 14, cell: r => r.ticker ?? '—' },
  { header: 'Active', width: 8, cell: r => (r.is_active ? 'Yes' : 'No'), color: r => (r.is_active ? 'green' : 'red') },
]

export function Assets({ uid, active, onExit }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)

  const { data, error } = useAsync(async () => {
    const [me, assets] = await Promise.all([prisma.user.findUnique({ where: { id: uid }, select: { is_admin: true } }), load_assets()])
    return { isAdmin: !!me?.is_admin, rows: assets as AssetRow[] }
  }, [uid, reload])

  const rows = data?.rows ?? []
  const isAdmin = data?.isAdmin ?? false
  const [cursor] = useListNav(rows.length, active && mode === 'list')
  const maxRows = useViewportRows()
  const sel = rows.length > 0 ? rows[Math.min(cursor, rows.length - 1)] : null

  const finish = (r: ActionResult<unknown>) => {
    setResult(r)
    if (r.success) setReload(n => n + 1)
    setMode('list')
  }

  useInput(
    (input, key) => {
      if (key.escape || key.leftArrow) return onExit()
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
          {isAdmin ? '↑↓ move · a add · e edit · d delete · esc menu' : 'view only (assets are admin-managed) · esc menu'}
        </Text>
      </Box>
    </Panel>
  )
}
