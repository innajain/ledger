import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { compute_balances_core } from '@/app/_core/balances_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { money } from '../../format'

type HoldingRow = {
  asset: string
  type: string
  qty: number
  cost: number
  price: number | null
  value: number
}

export function Holdings({ uid }: { uid: string }) {
  const [rows, setRows] = useState<HoldingRow[] | null>(null)
  const [total, setTotal] = useState<number>(0)

  useEffect(() => {
    async function load() {
      const [{ assetsToAccounts }, assets] = await Promise.all([
        compute_balances_core(uid),
        prisma.asset.findMany({ select: { id: true, name: true, type: true, ticker: true } }),
      ])
      const priceByAsset = await get_prices_for_assets(assets)
      const assetById = new Map(assets.map(a => [a.id, a]))

      let sum = 0
      const newRows: HoldingRow[] = []
      for (const [assetId, accMap] of assetsToAccounts) {
        const asset = assetById.get(assetId)
        if (!asset) continue
        let qty = 0
        let cost = 0
        for (const bal of accMap.values()) {
          qty += bal.qty
          cost += bal.txn_value
        }
        if (Math.abs(qty) < 1e-9) continue
        const priced = priceByAsset.get(assetId)
        const value = compute_current_value(
          asset.type,
          new Prisma.Decimal(qty),
          priced ? new Prisma.Decimal(priced.price) : null,
          new Prisma.Decimal(cost),
        ).toNumber()
        sum += value
        newRows.push({
          asset: asset.name,
          type: asset.type,
          qty,
          cost,
          price: priced ? priced.price : null,
          value,
        })
      }
      newRows.sort((a, b) => b.value - a.value)
      setRows(newRows)
      setTotal(sum)
    }
    load()
  }, [uid])

  if (!rows) return <Text color="yellow">Loading holdings...</Text>
  if (rows.length === 0) return <Text>No holdings found.</Text>

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} marginY={1}>
      <Text color="cyan" bold>
        Holdings
      </Text>
      <Box flexDirection="row" marginTop={1}>
        <Box width={15}>
          <Text bold>Asset</Text>
        </Box>
        <Box width={10}>
          <Text bold>Type</Text>
        </Box>
        <Box width={10}>
          <Text bold>Qty</Text>
        </Box>
        <Box width={15}>
          <Text bold>Cost</Text>
        </Box>
        <Box width={15}>
          <Text bold>Price</Text>
        </Box>
        <Box width={15}>
          <Text bold>Value</Text>
        </Box>
      </Box>
      <Text color="gray">{'─'.repeat(80)}</Text>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          <Box width={15}>
            <Text wrap="truncate">{r.asset}</Text>
          </Box>
          <Box width={10}>
            <Text wrap="truncate">{r.type}</Text>
          </Box>
          <Box width={10}>
            <Text>{r.qty.toFixed(4)}</Text>
          </Box>
          <Box width={15}>
            <Text>{money(r.cost)}</Text>
          </Box>
          <Box width={15}>
            <Text>{r.price !== null ? money(r.price) : '—'}</Text>
          </Box>
          <Box width={15}>
            <Text>{money(r.value)}</Text>
          </Box>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text bold>Total Holdings Value: {money(total)}</Text>
      </Box>
    </Box>
  )
}
