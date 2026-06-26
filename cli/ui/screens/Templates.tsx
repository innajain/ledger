import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { get_transaction_templates_core } from '@/app/_core/templates_core'

type TemplateRow = {
  id: string
  desc: string
  linesCount: number
}

export function Templates({ uid }: { uid: string }) {
  const [rows, setRows] = useState<TemplateRow[] | null>(null)

  useEffect(() => {
    async function load() {
      const templates = await get_transaction_templates_core(uid)
      const mapped = templates.map(t => ({
        id: t.id.substring(0, 8),
        desc: t.description ?? '—',
        linesCount: t.line_items.length,
      }))
      setRows(mapped)
    }
    load()
  }, [uid])

  if (!rows) return <Text color="yellow">Loading templates...</Text>
  if (rows.length === 0) return <Text>No templates found.</Text>

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" padding={1} marginY={1}>
      <Text color="magenta" bold>
        Transaction Templates
      </Text>
      <Box flexDirection="row" marginTop={1}>
        <Box width={10}>
          <Text bold>ID</Text>
        </Box>
        <Box width={40}>
          <Text bold>Description</Text>
        </Box>
        <Box width={15}>
          <Text bold>Line Items</Text>
        </Box>
      </Box>
      <Text color="gray">{'─'.repeat(65)}</Text>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          <Box width={10}>
            <Text color="gray">{r.id}</Text>
          </Box>
          <Box width={40}>
            <Text wrap="truncate">{r.desc}</Text>
          </Box>
          <Box width={15}>
            <Text>{r.linesCount}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
