import React, { useState } from 'react'
import { Box, Text } from 'ink'
import type { accounting_head_type } from '@/generated/prisma/client'
import { create_account_core, update_account_core, find_user_by_username_core } from '@/app/_core/resources_core'
import type { ActionResult } from '@/app/_actions/_result'
import { load_heads } from '../../shared'
import { useAsync } from '../hooks/useAsync'
import { Panel } from './Panel'
import { Picker, type PickItem } from './Picker'
import { TextField, Confirm } from './Field'
import { Loading, ErrorView } from './Status'

export type HeadEdit = { id: string; name: string; type: accounting_head_type; parent_id: string | null; is_active: boolean }

const TYPE_ITEMS: PickItem[] = [
  { id: 'account', name: 'account' },
  { id: 'income_expense', name: 'income_expense' },
  { id: 'allocation', name: 'allocation' },
]

type Phase = 'type' | 'name' | 'parent' | 'active' | 'link' | 'saving'

export function HeadForm({
  uid,
  edit,
  onDone,
  onCancel,
}: {
  uid: string
  edit?: HeadEdit
  onDone: (r: ActionResult<unknown>) => void
  onCancel: () => void
}) {
  const { data: heads, error } = useAsync(async () => (await load_heads(uid)).map(h => ({ id: h.id, name: h.name }) as PickItem), [uid])

  const [phase, setPhase] = useState<Phase>(edit ? 'name' : 'type')
  const [type, setType] = useState<accounting_head_type | null>(edit?.type ?? null)
  const [name, setName] = useState(edit?.name ?? '')
  const [parentId, setParentId] = useState<string | null | undefined>(undefined)
  const [isActive, setIsActive] = useState<boolean | undefined>(undefined)
  const [linkStr, setLinkStr] = useState('')
  const [err, setErr] = useState<string | null>(null)

  if (error) return <ErrorView message={error} />
  if (!heads) return <Loading label="Loading…" />

  const submit = async (link: string | null | undefined) => {
    setPhase('saving')
    if (edit) onDone(await update_account_core(uid, edit.id, name, undefined, parentId, isActive, undefined, link))
    else onDone(await create_account_core(uid, name, type as accounting_head_type, parentId ?? null, link ?? null))
  }

  const afterCore = (nextLinkPhase: boolean) => {
    if ((edit?.type ?? type) === 'account') setPhase('link')
    else if (nextLinkPhase) void submit(undefined)
  }

  const parentItems: PickItem[] = [
    ...(edit ? [{ id: '__keep__', name: '(keep current)' }] : []),
    { id: '__none__', name: '(no parent)' },
    ...heads.filter(h => h.id !== edit?.id),
  ]

  const resolveLink = async (raw: string, keepAllowed: boolean) => {
    const v = raw.trim()
    if (v === '' && keepAllowed) return void submit(undefined)
    if (v === '' || v === 'none' || v === '-') return void submit(null)
    const res = await find_user_by_username_core(uid, v)
    if (!res.success) return setErr(res.message)
    setErr(null)
    void submit(res.data!.id)
  }

  return (
    <Panel title={edit ? `Edit head — ${edit.name}` : 'New head'} color="green">
      {phase === 'type' && (
        <Picker label="Type" items={TYPE_ITEMS} onSelect={t => (setType(t.id as accounting_head_type), setPhase('name'))} onCancel={onCancel} />
      )}

      {phase === 'name' && (
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          onSubmit={v => (v.trim() === '' ? setErr('Name is required') : (setErr(null), setName(v.trim()), setPhase('parent')))}
        />
      )}

      {phase === 'parent' && (
        <Picker
          label="Parent"
          items={parentItems}
          onSelect={p => {
            setParentId(p.id === '__keep__' ? undefined : p.id === '__none__' ? null : p.id)
            if (edit) setPhase('active')
            else afterCore(true)
          }}
          onCancel={onCancel}
        />
      )}

      {phase === 'active' && (
        <Confirm
          message="Active?"
          onAnswer={yes => {
            setIsActive(yes)
            afterCore(true)
          }}
        />
      )}

      {phase === 'link' && (
        <TextField
          label={edit ? "Linked username (blank=keep, '-' to clear)" : 'Linked username (blank=none)'}
          value={linkStr}
          onChange={setLinkStr}
          onSubmit={v => void resolveLink(v, !!edit)}
        />
      )}

      {phase === 'saving' && <Text color="yellow">Saving…</Text>}

      {err && <Text color="red">{err}</Text>}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          enter to continue · esc to cancel
        </Text>
      </Box>
    </Panel>
  )
}
