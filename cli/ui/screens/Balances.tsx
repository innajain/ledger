import React from 'react'
import { compute_balances_core } from '@/app/_core/balances_core'
import { load_heads, load_assets } from '../../shared'
import { money, qty } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { useExitOnEsc } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import type { ScreenProps } from '../types'

type BalanceRow = {
  account: string
  asset: string
  qty: number
  value: number
}

const columns: Column<BalanceRow>[] = [
  { header: 'Account', width: 22, cell: r => r.account },
  { header: 'Asset', width: 16, cell: r => r.asset },
  { header: 'Qty', width: 14, align: 'right', cell: r => qty(r.qty) },
  { header: 'Value', width: 16, align: 'right', cell: r => money(r.value), color: r => (r.value < 0 ? 'red' : undefined) },
]

export function Balances({ uid, active, onExit }: ScreenProps) {
  useExitOnEsc(active, onExit)
  const { data: rows, error } = useAsync<BalanceRow[]>(async () => {
    const [{ accountsToAssets }, heads, assets] = await Promise.all([compute_balances_core(uid), load_heads(uid), load_assets()])
    const headById = new Map(heads.map(h => [h.id, h]))
    const assetById = new Map(assets.map(a => [a.id, a]))

    const newRows: BalanceRow[] = []
    for (const [headId, assetMap] of accountsToAssets) {
      const head = headById.get(headId)
      if (!head || head.type !== 'account') continue
      for (const [assetId, bal] of assetMap) {
        if (Math.abs(bal.qty) < 1e-9 && Math.abs(bal.txn_value) < 1e-9) continue
        newRows.push({ account: head.name, asset: assetById.get(assetId)?.name ?? assetId, qty: bal.qty, value: bal.txn_value })
      }
    }
    newRows.sort((a, b) => a.account.localeCompare(b.account) || a.asset.localeCompare(b.asset))
    return newRows
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading balances…" />

  return (
    <Panel title="Account Balances" color="magenta">
      {rows.length === 0 ? <Empty label="No account balances." /> : <DataTable columns={columns} rows={rows} />}
    </Panel>
  )
}
