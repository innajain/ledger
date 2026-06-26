import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { compute_balances_core } from '@/app/_core/balances_core'
import { load_heads, load_assets } from '../../shared'
import { money } from '../../format'

type BalanceRow = {
  account: string
  asset: string
  qty: number
  value: number
}

export function Balances({ uid }: { uid: string }) {
  const [rows, setRows] = useState<BalanceRow[] | null>(null)

  useEffect(() => {
    async function load() {
      const [{ accountsToAssets }, heads, assets] = await Promise.all([compute_balances_core(uid), load_heads(uid), load_assets()])
      const headById = new Map<string, { id: string; name: string; type: string }>(heads.map(h => [h.id, h]))
      const assetById = new Map<string, { id: string; name: string; type: string }>(assets.map(a => [a.id, a]))

      const newRows: BalanceRow[] = []
      for (const [headId, assetMap] of accountsToAssets) {
        const head = headById.get(headId)
        if (!head || head.type !== 'account') continue
        for (const [assetId, bal] of assetMap) {
          if (Math.abs(bal.qty) < 1e-9 && Math.abs(bal.txn_value) < 1e-9) continue
          newRows.push({
            account: head.name,
            asset: assetById.get(assetId)?.name ?? assetId,
            qty: bal.qty,
            value: bal.txn_value,
          })
        }
      }
      newRows.sort((a, b) => a.account.localeCompare(b.account) || a.asset.localeCompare(b.asset))
      setRows(newRows)
    }
    load()
  }, [uid])

  if (!rows) return <Text color="yellow">Loading balances...</Text>

  if (rows.length === 0) return <Text>No account balances found.</Text>

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" padding={1} marginY={1}>
      <Text color="magenta" bold>
        Account Balances
      </Text>
      <Box flexDirection="row" marginTop={1} borderBottom={false}>
        <Box width={20}>
          <Text bold>Account</Text>
        </Box>
        <Box width={15}>
          <Text bold>Asset</Text>
        </Box>
        <Box width={15}>
          <Text bold>Qty</Text>
        </Box>
        <Box width={15}>
          <Text bold>Value</Text>
        </Box>
      </Box>
      <Text color="gray">{'─'.repeat(65)}</Text>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          <Box width={20}>
            <Text wrap="truncate">{r.account}</Text>
          </Box>
          <Box width={15}>
            <Text wrap="truncate">{r.asset}</Text>
          </Box>
          <Box width={15}>
            <Text>{r.qty}</Text>
          </Box>
          <Box width={15}>
            <Text>{money(r.value)}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
