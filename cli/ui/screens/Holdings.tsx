import React from 'react'
import { Box, Text } from 'ink'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { compute_balances_core } from '@/app/_core/balances_core'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { money, qty } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { useExitOnEsc, useListNav, useViewportRows } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import type { ScreenProps } from '../types'

type HoldingRow = {
  asset: string
  type: string
  qty: number
  cost: number
  price: number | null
  value: number
}

const columns: Column<HoldingRow>[] = [
  { header: 'Asset', width: 18, cell: r => r.asset },
  { header: 'Type', width: 8, cell: r => r.type },
  { header: 'Qty', width: 12, align: 'right', cell: r => qty(r.qty) },
  { header: 'Cost', width: 14, align: 'right', cell: r => money(r.cost) },
  { header: 'Price', width: 12, align: 'right', cell: r => (r.price !== null ? money(r.price) : '—') },
  { header: 'Value', width: 14, align: 'right', cell: r => money(r.value) },
]

export function Holdings({ uid, active, onExit }: ScreenProps) {
  useExitOnEsc(active, onExit)
  const { data, error } = useAsync(async () => {
    const [{ assetsToAccounts }, assets] = await Promise.all([
      compute_balances_core(uid),
      prisma.asset.findMany({ select: { id: true, name: true, type: true, ticker: true } }),
    ])
    const priceByAsset = await get_prices_for_assets(assets)
    const assetById = new Map(assets.map(a => [a.id, a]))

    let total = 0
    const rows: HoldingRow[] = []
    for (const [assetId, accMap] of assetsToAccounts) {
      const asset = assetById.get(assetId)
      if (!asset) continue
      let qtySum = 0
      let cost = 0
      for (const bal of accMap.values()) {
        qtySum += bal.qty
        cost += bal.txn_value
      }
      if (Math.abs(qtySum) < 1e-9) continue
      const priced = priceByAsset.get(assetId)
      const value = compute_current_value(
        asset.type,
        new Prisma.Decimal(qtySum),
        priced ? new Prisma.Decimal(priced.price) : null,
        new Prisma.Decimal(cost),
      ).toNumber()
      total += value
      rows.push({ asset: asset.name, type: asset.type, qty: qtySum, cost, price: priced ? priced.price : null, value })
    }
    rows.sort((a, b) => b.value - a.value)
    return { rows, total }
  }, [uid])

  const [cursor] = useListNav(data?.rows.length ?? 0, active)
  const maxRows = useViewportRows()

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading holdings…" />

  return (
    <Panel title="Holdings" color="cyan">
      {data.rows.length === 0 ? (
        <Empty label="No holdings." />
      ) : (
        <>
          <DataTable columns={columns} rows={data.rows} selectedIndex={cursor} maxRows={maxRows} />
          <Box marginTop={1}>
            <Text bold>Total value: {money(data.total)}</Text>
          </Box>
        </>
      )}
    </Panel>
  )
}
