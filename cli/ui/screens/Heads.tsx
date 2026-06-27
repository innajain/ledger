import React from 'react'
import { prisma } from '@/lib/prisma'
import { load_heads } from '../../shared'
import { useAsync } from '../hooks/useAsync'
import { useExitOnEsc } from '../hooks/useListNav'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'
import type { ScreenProps } from '../types'

type HeadRow = {
  id: string
  name: string
  type: string
  parent: string | null
  active: boolean
  linkedUser: string | null
}

const columns: Column<HeadRow>[] = [
  { header: 'ID', width: 10, cell: r => r.id, fixedColor: 'gray' },
  { header: 'Name', width: 20, cell: r => r.name },
  { header: 'Type', width: 15, cell: r => r.type },
  { header: 'Parent', width: 18, cell: r => r.parent ?? '—' },
  { header: 'Linked', width: 14, cell: r => r.linkedUser ?? '—', color: r => (r.linkedUser ? 'cyan' : undefined) },
  { header: 'Active', width: 8, cell: r => (r.active ? 'Yes' : 'No'), color: r => (r.active ? 'green' : 'red') },
]

export function Heads({ uid, active, onExit }: ScreenProps) {
  useExitOnEsc(active, onExit)
  const { data: rows, error } = useAsync<HeadRow[]>(async () => {
    const heads = await load_heads(uid)
    const users = await prisma.user.findMany({ select: { id: true, username: true } })
    const userById = new Map(users.map(u => [u.id, u.username]))
    const headById = new Map(heads.map(h => [h.id, h.name]))
    return heads.map(h => ({
      id: h.id.substring(0, 8),
      name: h.name,
      type: h.type,
      parent: h.parent_id ? (headById.get(h.parent_id) ?? null) : null,
      active: h.is_active,
      linkedUser: h.linked_user_id ? (userById.get(h.linked_user_id) ?? null) : null,
    }))
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading heads…" />

  return (
    <Panel title="Accounting Heads" color="green">
      {rows.length === 0 ? <Empty label="No heads." /> : <DataTable columns={columns} rows={rows} />}
    </Panel>
  )
}
