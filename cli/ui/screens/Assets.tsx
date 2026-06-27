import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { load_assets } from '../../shared'

type AssetRow = {
  id: string
  name: string
  type: string
  ticker: string | null
  active: boolean
}

export function Assets() {
  const [rows, setRows] = useState<AssetRow[] | null>(null)

  useEffect(() => {
    async function load() {
      const assets = await load_assets()
      const mapped = assets.map(a => ({
        id: a.id.substring(0, 8),
        name: a.name,
        type: a.type,
        ticker: a.ticker,
        active: a.is_active,
      }))
      setRows(mapped)
    }
    load()
  }, [])

  if (!rows) return <Text color="yellow">Loading assets...</Text>
  if (rows.length === 0) return <Text>No assets found.</Text>

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" padding={1} marginY={1}>
      <Text color="blue" bold>
        Asset Catalog
      </Text>
      <Box flexDirection="row" marginTop={1}>
        <Box width={10}>
          <Text bold>ID</Text>
        </Box>
        <Box width={25}>
          <Text bold>Name</Text>
        </Box>
        <Box width={15}>
          <Text bold>Type</Text>
        </Box>
        <Box width={15}>
          <Text bold>Ticker</Text>
        </Box>
        <Box width={10}>
          <Text bold>Active</Text>
        </Box>
      </Box>
      <Text color="gray">{'─'.repeat(75)}</Text>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          <Box width={10}>
            <Text color="gray">{r.id}</Text>
          </Box>
          <Box width={25}>
            <Text wrap="truncate">{r.name}</Text>
          </Box>
          <Box width={15}>
            <Text>{r.type}</Text>
          </Box>
          <Box width={15}>
            <Text>{r.ticker ?? '—'}</Text>
          </Box>
          <Box width={10}>
            <Text color={r.active ? 'green' : 'red'}>{r.active ? 'Yes' : 'No'}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
