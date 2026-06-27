import React from 'react'
import { get_transaction_templates_core } from '@/app/_core/templates_core'
import { useAsync } from '../hooks/useAsync'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'

type TemplateRow = {
  id: string
  desc: string
  lines: number
}

const columns: Column<TemplateRow>[] = [
  { header: 'ID', width: 10, cell: r => r.id, fixedColor: 'gray' },
  { header: 'Description', width: 40, cell: r => r.desc },
  { header: 'Lines', width: 8, align: 'right', cell: r => String(r.lines) },
]

export function Templates({ uid }: { uid: string }) {
  const { data: rows, error } = useAsync<TemplateRow[]>(async () => {
    const templates = await get_transaction_templates_core(uid)
    return templates.map(t => ({ id: t.id.substring(0, 8), desc: t.description ?? '—', lines: t.line_items.length }))
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading templates…" />

  return (
    <Panel title="Transaction Templates" color="magenta">
      {rows.length === 0 ? <Empty label="No templates." /> : <DataTable columns={columns} rows={rows} />}
    </Panel>
  )
}
