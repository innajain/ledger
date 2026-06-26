import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { get_inbox, get_outbox } from '@/app/_utils/links'

type ApprovalRow = {
  id: string
  status: string
  type: string
  counterparty: string
  desc: string
}

export function Approvals({ uid }: { uid: string }) {
  const [rows, setRows] = useState<{ inbox: ApprovalRow[]; outbox: ApprovalRow[] } | null>(null)

  useEffect(() => {
    async function load() {
      const [inboxRaw, outboxRaw] = await Promise.all([get_inbox(uid), get_outbox(uid)])

      const inbox = inboxRaw.map(i => ({
        id: i.link_id.substring(0, 8),
        status: i.status + (i.can_revert ? ' (revertible)' : ''),
        type: i.kind,
        counterparty: i.other_username,
        desc: i.description ?? '—',
      }))

      const outbox = outboxRaw.map(i => ({
        id: i.link_id.substring(0, 8),
        status: 'pending',
        type: i.kind,
        counterparty: i.other_username,
        desc: i.description ?? '—',
      }))

      setRows({ inbox, outbox })
    }
    load()
  }, [uid])

  if (!rows) return <Text color="yellow">Loading approvals...</Text>

  return (
    <Box flexDirection="column" marginY={1}>
      <Box borderStyle="round" borderColor="magenta" padding={1} flexDirection="column">
        <Text color="magenta" bold>
          Inbox (Action Required)
        </Text>
        {rows.inbox.length === 0 ? (
          <Text>No pending approvals.</Text>
        ) : (
          rows.inbox.map((r, i) => (
            <Box key={i} flexDirection="row" marginTop={1}>
              <Box width={10}>
                <Text color="yellow">{r.id}</Text>
              </Box>
              <Box width={15}>
                <Text>{r.type}</Text>
              </Box>
              <Box width={15}>
                <Text>{r.counterparty}</Text>
              </Box>
              <Box width={20}>
                <Text wrap="truncate">{r.desc}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>

      <Box borderStyle="round" borderColor="blue" padding={1} flexDirection="column" marginTop={1}>
        <Text color="blue" bold>
          Outbox (Waiting for Others)
        </Text>
        {rows.outbox.length === 0 ? (
          <Text>No outgoing requests.</Text>
        ) : (
          rows.outbox.map((r, i) => (
            <Box key={i} flexDirection="row" marginTop={1}>
              <Box width={10}>
                <Text color="yellow">{r.id}</Text>
              </Box>
              <Box width={15}>
                <Text>{r.type}</Text>
              </Box>
              <Box width={15}>
                <Text>{r.counterparty}</Text>
              </Box>
              <Box width={20}>
                <Text wrap="truncate">{r.desc}</Text>
              </Box>
              <Box width={15}>
                <Text color={r.status === 'rejected' ? 'red' : 'white'}>{r.status}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}
