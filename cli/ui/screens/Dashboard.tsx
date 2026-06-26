import React, { useEffect, useState } from 'react'
import { Text, Box } from 'ink'
import { compute_net_worth, subtree_total, compute_xirr_for_accounts } from '@/app/_core/valuation_core'
import { money } from '../../format'

type DashboardData = {
  networth: number
  investments: { total: number; xirr: number | null } | null
  savings: number | null
  allocations: { name: string; total: number }[]
}

export function Dashboard({ uid }: { uid: string }) {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    async function load() {
      const { networth, allocations } = await compute_net_worth(uid)
      const invest = subtree_total(allocations, 'Investments')
      const savings = subtree_total(allocations, 'Savings')

      let xirr = null
      if (invest && invest.total !== 0) {
        xirr = await compute_xirr_for_accounts(uid, invest.ids, invest.total)
      }

      const allocs = allocations
        .filter(a => Math.abs(a.total) >= 0.005)
        .sort((a, b) => b.total - a.total)
        .map(a => ({ name: a.name, total: a.total }))

      setData({
        networth,
        investments: invest ? { total: invest.total, xirr } : null,
        savings: savings ? savings.total : null,
        allocations: allocs,
      })
    }
    load()
  }, [uid])

  if (!data) return <Text color="yellow">Loading dashboard...</Text>

  return (
    <Box flexDirection="column" marginY={1}>
      <Box borderStyle="round" borderColor="green" padding={1} flexDirection="column">
        <Text color="green" bold>
          Financial Overview
        </Text>
        <Box marginTop={1}>
          <Text>Net Worth: </Text>
          <Text bold>{money(data.networth)}</Text>
        </Box>
        {data.savings !== null && (
          <Box>
            <Text>Savings: </Text>
            <Text>{money(data.savings)}</Text>
          </Box>
        )}
        {data.investments && (
          <Box>
            <Text>Investments: </Text>
            <Text>{money(data.investments.total)}</Text>
            {data.investments.xirr !== null && <Text color="cyan"> (XIRR {(data.investments.xirr * 100).toFixed(2)}%)</Text>}
          </Box>
        )}
      </Box>

      <Box borderStyle="round" borderColor="blue" padding={1} flexDirection="column" marginTop={1}>
        <Text color="blue" bold>
          Allocations
        </Text>
        {data.allocations.map(a => (
          <Box key={a.name} justifyContent="space-between" width={40}>
            <Text>{a.name}</Text>
            <Text>{money(a.total)}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
