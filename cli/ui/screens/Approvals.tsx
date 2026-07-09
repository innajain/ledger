import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { get_inbox, get_outbox, type InboxItem, type OutboxItem } from '@/app/_utils/links'
import { reject_request_core, cancel_request_core, approve_request_core, accept_all_from_core } from '@/app/_core/approvals_core'
import type { ActionResult } from '@/app/_actions/_result'
import { useAsync } from '../hooks/useAsync'
import { useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import { Confirm } from '../components/Field'
import { Picker, type PickItem } from '../components/Picker'
import { ActionFeedback } from '../components/ActionFeedback'
import { ApprovalEditor } from '../components/ApprovalEditor'
import { load_heads } from '../../shared'
import type { ScreenProps } from '../types'

type Row = { box: 'in'; item: InboxItem } | { box: 'out'; item: OutboxItem }
type Mode = 'list' | 'editor' | 'confirm' | 'accept-all'

const columns: Column<Row>[] = [
  { header: '', width: 4, cell: r => (r.box === 'in' ? '←in' : 'out'), color: r => (r.box === 'in' ? 'magenta' : 'blue') },
  { header: 'Kind', width: 10, cell: r => r.item.kind },
  { header: 'With', width: 16, cell: r => r.item.other_username },
  {
    header: 'Status',
    width: 18,
    cell: r => (r.box === 'in' ? r.item.status + (r.item.can_revert ? ' ↩' : '') : 'pending'),
    color: r => (r.box === 'in' && r.item.status === 'rejected' ? 'red' : undefined),
  },
  { header: 'Description', width: 28, cell: r => r.item.description ?? '—' },
]

export function Approvals({ uid, active, onExit }: ScreenProps) {
  const [reload, setReload] = useState(0)
  const [mode, setMode] = useState<Mode>('list')
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [editorLink, setEditorLink] = useState<string | null>(null)
  const [acceptCp, setAcceptCp] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ msg: string; run: () => Promise<ActionResult<unknown>> } | null>(null)

  const { data, error } = useAsync(async () => {
    const [inbox, outbox] = await Promise.all([get_inbox(uid), get_outbox(uid)])
    const rows: Row[] = [...inbox.map(item => ({ box: 'in' as const, item })), ...outbox.map(item => ({ box: 'out' as const, item }))]
    return rows
  }, [uid, reload])

  const [cursor] = useListNav(data?.length ?? 0, active && mode === 'list')
  const maxRows = useViewportRows()
  const sel = data && data.length > 0 ? data[Math.min(cursor, data.length - 1)] : null

  const finish = (r: ActionResult<unknown>) => {
    setResult(r)
    if (r.success) setReload(n => n + 1)
    setMode('list')
  }

  useInput(
    (input, key) => {
      if (key.escape || key.leftArrow) return onExit()
      if (!sel) return
      if (sel.box === 'in') {
        const it = sel.item
        if (input === 'a' && it.status === 'pending') {
          if (it.kind === 'deletion') {
            setConfirm({ msg: `Approve deletion from @${it.other_username}?`, run: () => approve_request_core(uid, it.link_id, []) })
            setMode('confirm')
          } else {
            setEditorLink(it.link_id)
            setMode('editor')
          }
        } else if (input === 'r' && it.status === 'pending') {
          setConfirm({ msg: `Reject request from @${it.other_username}?`, run: () => reject_request_core(uid, it.link_id) })
          setMode('confirm')
        } else if (input === 'v' && it.can_revert) {
          setEditorLink(it.link_id)
          setMode('editor')
        } else if (input === 'A' && it.status === 'pending' && it.kind === 'change') {
          setAcceptCp(it.other_id)
          setMode('accept-all')
        }
      } else if (input === 'c') {
        const it = sel.item
        setConfirm({ msg: `Cancel your request to @${it.other_username}?`, run: () => cancel_request_core(uid, it.link_id) })
        setMode('confirm')
      }
    },
    { isActive: active && mode === 'list' },
  )

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading approvals…" />

  if (mode === 'editor' && editorLink) return <ApprovalEditor uid={uid} linkId={editorLink} onDone={finish} onCancel={() => setMode('list')} />

  if (mode === 'confirm' && confirm)
    return <Confirm message={confirm.msg} onAnswer={async yes => (yes ? finish(await confirm.run()) : setMode('list'))} />

  if (mode === 'accept-all' && acceptCp) return <AcceptAllPicker uid={uid} counterparty={acceptCp} onDone={finish} onCancel={() => setMode('list')} />

  return (
    <Panel title="Approvals" color="magenta">
      {data.length === 0 ? <Empty label="No requests." /> : <DataTable columns={columns} rows={data} selectedIndex={cursor} maxRows={maxRows} />}
      {result && (
        <Box marginTop={1}>
          <ActionFeedback result={result} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · inbox: a approve · r reject · v revert · A accept-all · outbox: c cancel · esc menu
        </Text>
      </Box>
    </Panel>
  )
}

function AcceptAllPicker({
  uid,
  counterparty,
  onDone,
  onCancel,
}: {
  uid: string
  counterparty: string
  onDone: (r: ActionResult<unknown>) => void
  onCancel: () => void
}) {
  const { data, error } = useAsync(async () => {
    const heads = await load_heads(uid)
    return heads.filter(h => h.type === 'account' && !h.linked_user_id).map(h => ({ id: h.id, name: h.name }) as PickItem)
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading accounts…" />

  return (
    <Panel title="Accept all — balance onto which account?" color="green">
      <Picker label="Account" items={data} onSelect={async a => onDone(await accept_all_from_core(uid, counterparty, a.id))} onCancel={onCancel} />
    </Panel>
  )
}
