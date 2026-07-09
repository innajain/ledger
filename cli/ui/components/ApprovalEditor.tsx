import React from 'react'
import { Box, Text, useInput } from 'ink'
import { get_editor_context, type EditorContext } from '@/app/_utils/links'
import { approve_request_core, revert_request_core } from '@/app/_core/approvals_core'
import type { ActionResult } from '@/app/_actions/_result'
import { money, fmt_date } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { Panel } from './Panel'
import { DataTable, type Column } from './DataTable'
import { Loading, ErrorView } from './Status'
import { LineItemEditor } from './LineItemEditor'

type SharedLine = EditorContext['mirrored_lines'][number]

const fmtLine = (l: SharedLine): string =>
  l.asset_type === 'rupees'
    ? l.quantity == null
      ? '—'
      : money(l.quantity)
    : `${l.quantity ?? '—'} · book ${l.txn_value == null ? '—' : money(l.txn_value)}`

function DiffPanel({ ctx }: { ctx: EditorContext }) {
  const prev = ctx.previous
  if (!prev || ctx.mode === 'revert') return null
  const dateChanged = prev.datetime !== ctx.datetime
  const descChanged = (prev.description ?? '') !== (ctx.description ?? '')
  const linesChanged = JSON.stringify(prev.mirrored_lines) !== JSON.stringify(ctx.mirrored_lines)
  if (!dateChanged && !descChanged && !linesChanged) return null

  return (
    <Panel title="Proposed changes" color="yellow">
      {dateChanged && (
        <Text>
          Date: <Text color="red">{prev.datetime ? fmt_date(new Date(prev.datetime)) : '—'}</Text> →{' '}
          <Text color="green">{ctx.datetime ? fmt_date(new Date(ctx.datetime)) : '—'}</Text>
        </Text>
      )}
      {descChanged && (
        <Text>
          Description: <Text color="red">{prev.description || '—'}</Text> → <Text color="green">{ctx.description || '—'}</Text>
        </Text>
      )}
      {linesChanged && (
        <Box flexDirection="column" marginTop={dateChanged || descChanged ? 1 : 0}>
          <Text color="gray">Shared lines:</Text>
          {prev.mirrored_lines.map((l, i) => (
            <Text key={`o${i}`} color="red">
              {'  - '}
              {l.asset_name}: {fmtLine(l)}
            </Text>
          ))}
          {ctx.mirrored_lines.map((l, i) => (
            <Text key={`n${i}`} color="green">
              {'  + '}
              {l.asset_name}: {fmtLine(l)}
            </Text>
          ))}
        </Box>
      )}
    </Panel>
  )
}

const mirroredColumns: Column<SharedLine>[] = [
  { header: 'Asset', width: 20, cell: l => l.asset_name },
  { header: 'Qty', width: 14, align: 'right', cell: l => (l.quantity == null ? 'auto' : String(l.quantity)) },
  { header: 'Book value', width: 16, align: 'right', cell: l => (l.txn_value == null ? '·' : money(l.txn_value)) },
]

export function ApprovalEditor({
  uid,
  linkId,
  onDone,
  onCancel,
}: {
  uid: string
  linkId: string
  onDone: (r: ActionResult) => void
  onCancel: () => void
}) {
  const { data, error } = useAsync(async () => ({ ctx: await get_editor_context(uid, linkId) }), [uid, linkId])

  const noEditor = !!data && data.ctx === null
  useInput(
    (_i, key) => {
      if (key.escape || key.leftArrow || key.return) onCancel()
    },
    { isActive: noEditor },
  )

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading request…" />
  if (data.ctx === null)
    return <Text color="gray">This request isn’t awaiting your action (or is a deletion — approve/reject it inline). esc to go back.</Text>

  const ctx = data.ctx
  const submit = ctx.mode === 'revert' ? revert_request_core : approve_request_core

  return (
    <Box flexDirection="column">
      <Panel title={ctx.mode === 'revert' ? 'Revert to approved' : `Approve request from @${ctx.other_username}`} color="green">
        <Text>
          <Text color="gray">Date: </Text>
          {ctx.datetime ? fmt_date(new Date(ctx.datetime)) : '—'}
          <Text color="gray"> Description: </Text>
          {ctx.description ?? '—'}
          <Text color="gray"> (locked)</Text>
        </Text>
      </Panel>

      <DiffPanel ctx={ctx} />

      {ctx.mirrored_lines.length > 0 && (
        <Panel title={`Mirrored lines — locked${ctx.reciprocal_head ? ` (on ${ctx.reciprocal_head.name})` : ''}`} color="gray">
          <DataTable columns={mirroredColumns} rows={ctx.mirrored_lines} />
        </Panel>
      )}

      <LineItemEditor
        uid={uid}
        mode="lines"
        excludeLinkedHeads
        title="Your balancing lines (so it balances in your ledger)"
        onDone={async p => onDone(await submit(uid, linkId, p.line_items))}
        onCancel={onCancel}
      />
    </Box>
  )
}
