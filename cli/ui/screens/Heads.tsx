import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { prisma } from '@/lib/prisma'
import type { accounting_head_type } from '@/generated/prisma/client'
import { delete_account_core } from '@/app/_core/resources_core'
import type { ActionResult } from '@/app/_actions/_result'
import { load_heads } from '../../shared'
import { useAsync } from '../hooks/useAsync'
import { useListNav } from '../hooks/useListNav'
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
type Mode = 'list' | 'add' | 'edit' | 'deleting'

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

  const { data: rows, error } = useAsync<HeadRow[]>(async () => {
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

  const [cursor] = useListNav(rows?.length ?? 0, active && mode === 'list')
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
      } else if (input === 'e' && sel) setMode('edit')
      else if (input === 'd' && sel) setMode('deleting')
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
  if (mode === 'deleting' && sel)
    return (
      <Confirm
        message={`Delete head "${sel.name}"?`}
        onAnswer={async yes => (yes ? finish(await delete_account_core(uid, sel.id)) : setMode('list'))}
      />
    )

  return (
    <Panel title="Accounting Heads" color="green">
      {rows.length === 0 ? <Empty label="No heads." /> : <DataTable columns={columns} rows={rows} selectedIndex={cursor} />}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · a add · e edit · d delete · esc menu
        </Text>
      </Box>
    </Panel>
  )
}
