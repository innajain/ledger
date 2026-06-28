import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { get_transaction_templates_core, delete_transaction_template_core, create_transaction_template_core } from '@/app/_core/templates_core'
import { create_transaction_core, type CreateLineItemInput } from '@/app/_core/transactions_core'
import type { ActionResult } from '@/app/_actions/_result'
import { useAsync } from '../hooks/useAsync'
import { useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import { Confirm } from '../components/Field'
import { ActionFeedback } from '../components/ActionFeedback'
import { LineItemEditor } from '../components/LineItemEditor'
import type { ScreenProps } from '../types'

type Template = Awaited<ReturnType<typeof get_transaction_templates_core>>[number]
type Mode = 'list' | 'add' | 'applying' | 'deleting'

const columns: Column<Template>[] = [
  { header: 'Description', width: 40, cell: t => t.description ?? '—' },
  { header: 'Lines', width: 8, align: 'right', cell: t => String(t.line_items.length) },
]

const toInputs = (t: Template): CreateLineItemInput[] =>
  t.line_items.map(li => ({
    accounting_head_id: li.accounting_head_id,
    asset_id: li.asset_id,
    quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
    txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
    description: li.description ?? null,
  }))

export function Templates({ uid, active, onExit }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)

  const { data: rows, error } = useAsync(async () => get_transaction_templates_core(uid), [uid, reload])

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
      if (input === 'a') {
        setResult(null)
        setMode('add')
      } else if (key.return && sel) setMode('applying')
      else if (input === 'd' && sel) setMode('deleting')
    },
    { isActive: active && mode === 'list' },
  )

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading templates…" />

  if (mode === 'add')
    return (
      <LineItemEditor
        uid={uid}
        title="New template"
        onDone={async p => finish(await create_transaction_template_core(uid, p.line_items, p.description))}
        onCancel={() => setMode('list')}
      />
    )
  if (mode === 'applying' && sel)
    return (
      <Confirm
        message={`Create a transaction from "${sel.description ?? 'template'}" (${sel.line_items.length} lines, dated today)?`}
        onAnswer={async yes =>
          yes ? finish(await create_transaction_core(uid, new Date(), toInputs(sel), sel.description ?? null)) : setMode('list')
        }
      />
    )
  if (mode === 'deleting' && sel)
    return (
      <Confirm
        message={`Delete template "${sel.description ?? 'template'}"?`}
        onAnswer={async yes => (yes ? finish(await delete_transaction_template_core(uid, sel.id)) : setMode('list'))}
      />
    )

  return (
    <Panel title="Transaction Templates" color="magenta">
      {rows.length === 0 ? <Empty label="No templates." /> : <DataTable columns={columns} rows={rows} selectedIndex={cursor} maxRows={maxRows} />}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · a add · enter apply · d delete · esc menu
        </Text>
      </Box>
    </Panel>
  )
}
