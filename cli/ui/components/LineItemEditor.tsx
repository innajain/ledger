import React, { useState } from 'react'
import { Box, Text } from 'ink'
import { asset_type } from '@/generated/prisma/enums'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/app/_utils/date'
import { load_heads, load_assets } from '../../shared'
import { money, qty as fmtQty } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { Panel } from './Panel'
import { DataTable, type Column } from './DataTable'
import { Picker, type PickItem } from './Picker'
import { TextField, Confirm } from './Field'
import { Loading, ErrorView } from './Status'

export type EditorPayload = { line_items: CreateLineItemInput[]; description: string | null; datetime: Date }

type Phase = 'head' | 'asset' | 'qty' | 'value' | 'note' | 'description' | 'datetime' | 'confirm'

type Head = { id: string; name: string; type: string; linked_user_id: string | null }
type Asset = { id: string; name: string; type: string; ticker: string | null }

/**
 * Sequential line-item builder shared by transaction create/edit, template
 * create, and the approval balancing step. Mirrors the CLI `build_line_items`
 * flow: per line → head → asset → qty → value (skipped for rupees) → note;
 * then (transaction mode) description → date → confirm.
 */
export function LineItemEditor({
  uid,
  mode = 'transaction',
  title = 'New transaction',
  initialDescription = null,
  initialDatetime,
  excludeLinkedHeads = false,
  onDone,
  onCancel,
}: {
  uid: string
  mode?: 'transaction' | 'lines'
  title?: string
  initialDescription?: string | null
  initialDatetime?: Date
  excludeLinkedHeads?: boolean
  onDone: (payload: EditorPayload) => void
  onCancel: () => void
}) {
  const { data, error } = useAsync(async () => {
    const [heads, assets] = await Promise.all([load_heads(uid), load_assets()])
    return { heads: heads as Head[], assets: assets as Asset[] }
  }, [uid])

  const [phase, setPhase] = useState<Phase>('head')
  const [lines, setLines] = useState<CreateLineItemInput[]>([])
  const [head, setHead] = useState<Head | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [qtyStr, setQtyStr] = useState('')
  const [valStr, setValStr] = useState('')
  const [noteStr, setNoteStr] = useState('')
  const [desc, setDesc] = useState(initialDescription ?? '')
  const [dateStr, setDateStr] = useState(get_indian_date_from_date_obj(initialDatetime ?? new Date()))
  const [fieldErr, setFieldErr] = useState<string | null>(null)

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading accounts…" />

  const headById = new Map(data.heads.map(h => [h.id, h]))
  const assetById = new Map(data.assets.map(a => [a.id, a]))
  const pickHeads: PickItem[] = data.heads.filter(h => !(excludeLinkedHeads && h.linked_user_id)).map(h => ({ id: h.id, name: h.name, hint: h.type }))
  const pickAssets: PickItem[] = data.assets.map(a => ({ id: a.id, name: a.name, hint: a.ticker ? `${a.type} ${a.ticker}` : a.type }))

  const resetDraft = () => {
    setHead(null)
    setAsset(null)
    setQtyStr('')
    setValStr('')
    setNoteStr('')
    setFieldErr(null)
  }

  const finishLines = () => {
    if (mode === 'lines') onDone({ line_items: lines, description: null, datetime: new Date() })
    else setPhase('description')
  }

  const canFinish = mode === 'lines' || lines.length >= 1

  const commitLine = () => {
    if (!head || !asset) return
    const line: CreateLineItemInput = {
      accounting_head_id: head.id,
      asset_id: asset.id,
      quantity: qtyStr === '' ? undefined : Number(qtyStr),
      txn_value: asset.type === asset_type.rupees || valStr === '' ? null : Number(valStr),
      description: noteStr === '' ? null : noteStr,
    }
    setLines([...lines, line])
    resetDraft()
    setPhase('head')
  }

  const previewColumns: Column<CreateLineItemInput>[] = [
    { header: 'Head', width: 22, cell: l => headById.get(l.accounting_head_id)?.name ?? l.accounting_head_id },
    { header: 'Asset', width: 18, cell: l => assetById.get(l.asset_id)?.name ?? l.asset_id },
    { header: 'Qty', width: 12, align: 'right', cell: l => (l.quantity === undefined ? 'auto' : fmtQty(l.quantity)) },
    { header: 'Value', width: 14, align: 'right', cell: l => (l.txn_value == null ? '·' : money(l.txn_value)) },
  ]

  return (
    <Panel title={title} color="yellow">
      {lines.length > 0 && (
        <Box marginBottom={1}>
          <DataTable columns={previewColumns} rows={lines} />
        </Box>
      )}

      {phase === 'head' && (
        <Picker
          label={`Line ${lines.length + 1} — head`}
          items={pickHeads}
          onSelect={h => {
            setHead(headById.get(h.id) ?? null)
            setPhase('asset')
          }}
          onCancel={onCancel}
          extra={canFinish ? { label: `✓ finish (${lines.length} line${lines.length === 1 ? '' : 's'})`, onPick: finishLines } : undefined}
        />
      )}

      {phase === 'asset' && (
        <Picker
          label="Asset"
          items={pickAssets}
          onSelect={a => {
            setAsset(assetById.get(a.id) ?? null)
            setPhase('qty')
          }}
          onCancel={() => {
            resetDraft()
            setPhase('head')
          }}
        />
      )}

      {phase === 'qty' && (
        <TextField
          label="Quantity (blank = auto)"
          value={qtyStr}
          onChange={setQtyStr}
          onSubmit={v => {
            if (v !== '' && !Number.isFinite(Number(v))) return setFieldErr('Quantity must be a number')
            setFieldErr(null)
            setPhase(asset?.type === asset_type.rupees ? 'note' : 'value')
          }}
        />
      )}

      {phase === 'value' && (
        <TextField
          label="Value ₹ (blank = auto)"
          value={valStr}
          onChange={setValStr}
          onSubmit={v => {
            if (v !== '' && !Number.isFinite(Number(v))) return setFieldErr('Value must be a number')
            setFieldErr(null)
            setPhase('note')
          }}
        />
      )}

      {phase === 'note' && <TextField label="Note (optional)" value={noteStr} onChange={setNoteStr} onSubmit={commitLine} />}

      {phase === 'description' && (
        <TextField label="Transaction description (optional)" value={desc} onChange={setDesc} onSubmit={() => setPhase('datetime')} />
      )}

      {phase === 'datetime' && (
        <TextField
          label="Date (dd-MM-yyyy)"
          value={dateStr}
          onChange={setDateStr}
          onSubmit={v => {
            if (Number.isNaN(get_date_obj_from_indian_date(v).getTime())) return setFieldErr('Use dd-MM-yyyy')
            setFieldErr(null)
            setPhase('confirm')
          }}
        />
      )}

      {phase === 'confirm' && (
        <Confirm
          message={`Save transaction with ${lines.length} line item(s)?`}
          onAnswer={yes =>
            yes ? onDone({ line_items: lines, description: desc === '' ? null : desc, datetime: get_date_obj_from_indian_date(dateStr) }) : onCancel()
          }
        />
      )}

      {fieldErr && <Text color="red">{fieldErr}</Text>}
      <Text color="gray" dimColor>
        {phase === 'head' ? 'esc cancels the whole entry' : 'enter to continue · esc to step back'}
      </Text>
    </Panel>
  )
}
