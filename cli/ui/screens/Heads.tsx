import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { load_heads } from '../../shared'
import { prisma } from '@/lib/prisma'

type HeadRow = {
  id: string
  name: string
  type: string
  parent: string | null
  active: boolean
  linkedUser: string | null
}

export function Heads({ uid }: { uid: string }) {
  const [rows, setRows] = useState<HeadRow[] | null>(null)

  useEffect(() => {
    async function load() {
      const heads = await load_heads(uid)
      const users = await prisma.user.findMany({ select: { id: true, username: true } })
      const userById = new Map(users.map(u => [u.id, u.username]))
      const headById = new Map(heads.map(h => [h.id, h.name]))

      const mapped = heads.map(h => ({
        id: h.id.substring(0, 8),
        name: h.name,
        type: h.type,
        parent: h.parent_id ? (headById.get(h.parent_id) ?? null) : null,
        active: h.is_active,
        linkedUser: h.linked_user_id ? (userById.get(h.linked_user_id) ?? null) : null,
      }))
      setRows(mapped)
    }
    load()
  }, [uid])

  if (!rows) return <Text color="yellow">Loading heads...</Text>
  if (rows.length === 0) return <Text>No heads found.</Text>

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1} marginY={1}>
      <Text color="green" bold>
        Accounting Heads
      </Text>
      <Box flexDirection="row" marginTop={1}>
        <Box width={10}>
          <Text bold>ID</Text>
        </Box>
        <Box width={20}>
          <Text bold>Name</Text>
        </Box>
        <Box width={15}>
          <Text bold>Type</Text>
        </Box>
        <Box width={20}>
          <Text bold>Parent</Text>
        </Box>
        <Box width={15}>
          <Text bold>Linked User</Text>
        </Box>
        <Box width={10}>
          <Text bold>Active</Text>
        </Box>
      </Box>
      <Text color="gray">{'─'.repeat(90)}</Text>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          <Box width={10}>
            <Text color="gray">{r.id}</Text>
          </Box>
          <Box width={20}>
            <Text wrap="truncate">{r.name}</Text>
          </Box>
          <Box width={15}>
            <Text>{r.type}</Text>
          </Box>
          <Box width={20}>
            <Text wrap="truncate">{r.parent ?? '—'}</Text>
          </Box>
          <Box width={15}>
            <Text wrap="truncate">{r.linkedUser ?? '—'}</Text>
          </Box>
          <Box width={10}>
            <Text color={r.active ? 'green' : 'red'}>{r.active ? 'Yes' : 'No'}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
