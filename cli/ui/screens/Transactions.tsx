import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { prisma } from '@/lib/prisma'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { money, fmt_date } from '../../format'

type TxnRow = {
  id: string
  date: string
  desc: string
  total: number
}

export function Transactions({ uid }: { uid: string }) {
  const [rows, setRows] = useState<TxnRow[] | null>(null)

  useEffect(() => {
    async function load() {
      const rawTxns = await prisma.transaction.findMany({
        where: { user_id: uid },
        orderBy: { datetime: 'desc' },
        take: 15,
        include: {
          line_items: {
            include: {
              accounting_head: true,
              asset: true,
            },
          },
        },
      })
      const mapped = rawTxns.map(r => {
        const t = normalize_txn(r)
        const total = t.line_items.reduce((s, li) => s + (li.txn_value.toNumber() > 0 ? li.txn_value.toNumber() : 0), 0)
        return {
          id: t.id,
          date: fmt_date(t.datetime),
          desc: t.description ?? '—',
          total,
        }
      })
      setRows(mapped)
    }
    load()
  }, [uid])

  if (!rows) return <Text color="yellow">Loading transactions...</Text>
  if (rows.length === 0) return <Text>No transactions found.</Text>

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1} marginY={1}>
      <Text color="yellow" bold>
        Recent Transactions
      </Text>
      <Box flexDirection="row" marginTop={1}>
        <Box width={12}>
          <Text bold>Date</Text>
        </Box>
        <Box width={30}>
          <Text bold>Description</Text>
        </Box>
        <Box width={15}>
          <Text bold>Amount</Text>
        </Box>
      </Box>
      <Text color="gray">{'─'.repeat(57)}</Text>
      {rows.map((r, i) => (
        <Box key={i} flexDirection="row">
          <Box width={12}>
            <Text>{r.date}</Text>
          </Box>
          <Box width={30}>
            <Text wrap="truncate">{r.desc}</Text>
          </Box>
          <Box width={15}>
            <Text>{money(r.total)}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
