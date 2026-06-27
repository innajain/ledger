import React from 'react'
import { load_assets } from '../../shared'
import { useAsync } from '../hooks/useAsync'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'

type AssetRow = {
  id: string
  name: string
  type: string
  ticker: string | null
  active: boolean
}

const columns: Column<AssetRow>[] = [
  { header: 'ID', width: 10, cell: r => r.id, fixedColor: 'gray' },
  { header: 'Name', width: 24, cell: r => r.name },
  { header: 'Type', width: 10, cell: r => r.type },
  { header: 'Ticker', width: 14, cell: r => r.ticker ?? '—' },
  { header: 'Active', width: 8, cell: r => (r.active ? 'Yes' : 'No'), color: r => (r.active ? 'green' : 'red') },
]

export function Assets() {
  const { data: rows, error } = useAsync<AssetRow[]>(async () => {
    const assets = await load_assets()
    return assets.map(a => ({ id: a.id.substring(0, 8), name: a.name, type: a.type, ticker: a.ticker, active: a.is_active }))
  }, [])

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading assets…" />

  return (
    <Panel title="Asset Catalog" color="blue">
      {rows.length === 0 ? <Empty label="No assets." /> : <DataTable columns={columns} rows={rows} />}
    </Panel>
  )
}
