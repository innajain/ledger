import React from 'react'
import { Box } from 'ink'
import { get_inbox, get_outbox } from '@/app/_utils/links'
import { useAsync } from '../hooks/useAsync'
import { useExitOnEsc } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import type { ScreenProps } from '../types'

type ApprovalRow = {
  id: string
  status: string
  kind: string
  counterparty: string
  desc: string
}

const inboxColumns: Column<ApprovalRow>[] = [
  { header: 'ID', width: 10, cell: r => r.id, fixedColor: 'yellow' },
  { header: 'Kind', width: 10, cell: r => r.kind },
  { header: 'From', width: 16, cell: r => r.counterparty },
  { header: 'Status', width: 18, cell: r => r.status, color: r => (r.status.startsWith('rejected') ? 'red' : undefined) },
  { header: 'Description', width: 24, cell: r => r.desc },
]

const outboxColumns: Column<ApprovalRow>[] = [
  { header: 'ID', width: 10, cell: r => r.id, fixedColor: 'yellow' },
  { header: 'Kind', width: 10, cell: r => r.kind },
  { header: 'To', width: 16, cell: r => r.counterparty },
  { header: 'Status', width: 18, cell: r => r.status, color: r => (r.status === 'rejected' ? 'red' : undefined) },
  { header: 'Description', width: 24, cell: r => r.desc },
]

export function Approvals({ uid, active, onExit }: ScreenProps) {
  useExitOnEsc(active, onExit)
  const { data, error } = useAsync(async () => {
    const [inboxRaw, outboxRaw] = await Promise.all([get_inbox(uid), get_outbox(uid)])
    const inbox: ApprovalRow[] = inboxRaw.map(i => ({
      id: i.link_id.substring(0, 8),
      status: i.status + (i.can_revert ? ' ↩ revertible' : ''),
      kind: i.kind,
      counterparty: i.other_username,
      desc: i.description ?? '—',
    }))
    const outbox: ApprovalRow[] = outboxRaw.map(i => ({
      id: i.link_id.substring(0, 8),
      status: 'pending',
      kind: i.kind,
      counterparty: i.other_username,
      desc: i.description ?? '—',
    }))
    return { inbox, outbox }
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading approvals…" />

  return (
    <Box flexDirection="column">
      <Panel title={`Inbox — awaiting you (${data.inbox.length})`} color="magenta">
        {data.inbox.length === 0 ? <Empty label="Nothing awaiting you." /> : <DataTable columns={inboxColumns} rows={data.inbox} />}
      </Panel>
      <Panel title={`Outbox — awaiting them (${data.outbox.length})`} color="blue">
        {data.outbox.length === 0 ? <Empty label="No outgoing requests." /> : <DataTable columns={outboxColumns} rows={data.outbox} />}
      </Panel>
    </Box>
  )
}
