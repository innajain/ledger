import React from 'react'
import { prisma } from '@/lib/prisma'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { money, fmt_date } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { Panel } from '../components/Panel'
import { DataTable, type Column } from '../components/DataTable'
import { Loading, ErrorView, Empty } from '../components/Status'

type TxnRow = {
  id: string
  date: string
  desc: string
  total: number
}

const columns: Column<TxnRow>[] = [
  { header: 'Date', width: 12, cell: r => r.date },
  { header: 'Description', width: 34, cell: r => r.desc },
  { header: 'Amount', width: 16, align: 'right', cell: r => money(r.total) },
]

export function Transactions({ uid }: { uid: string }) {
  const { data: rows, error } = useAsync<TxnRow[]>(async () => {
    const rawTxns = await prisma.transaction.findMany({
      where: { user_id: uid },
      orderBy: { datetime: 'desc' },
      take: 20,
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    })
    return rawTxns.map(r => {
      const t = normalize_txn(r)
      const total = t.line_items.reduce((s, li) => s + (li.txn_value.toNumber() > 0 ? li.txn_value.toNumber() : 0), 0)
      return { id: t.id, date: fmt_date(t.datetime), desc: t.description ?? '—', total }
    })
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!rows) return <Loading label="Loading transactions…" />

  return (
    <Panel title="Recent Transactions" color="yellow">
      {rows.length === 0 ? <Empty label="No transactions." /> : <DataTable columns={columns} rows={rows} />}
    </Panel>
  )
}
