import React from 'react'
import { Box, Text } from 'ink'
import { compute_net_worth, subtree_total, compute_xirr_for_accounts } from '@/app/_core/valuation_core'
import { money } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { Panel } from '../components/Panel'
import { Loading, ErrorView } from '../components/Status'

type DashboardData = {
  networth: number
  investments: { total: number; xirr: number | null } | null
  savings: number | null
  allocations: { name: string; total: number }[]
}

/** A label + right-aligned value row, used for the overview stats. */
function Stat({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) {
  return (
    <Box>
      <Box width={14}>
        <Text>{label}</Text>
      </Box>
      <Text bold color={color}>
        {value}
      </Text>
      {hint ? <Text color="cyan"> {hint}</Text> : null}
    </Box>
  )
}

export function Dashboard({ uid }: { uid: string }) {
  const { data, error } = useAsync<DashboardData>(async () => {
    const { networth, allocations } = await compute_net_worth(uid)
    const invest = subtree_total(allocations, 'Investments')
    const savings = subtree_total(allocations, 'Savings')
    const xirr = invest && invest.total !== 0 ? await compute_xirr_for_accounts(uid, invest.ids, invest.total) : null
    return {
      networth,
      investments: invest ? { total: invest.total, xirr } : null,
      savings: savings ? savings.total : null,
      allocations: allocations.filter(a => Math.abs(a.total) >= 0.005).sort((a, b) => b.total - a.total),
    }
  }, [uid])

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading dashboard…" />

  return (
    <Box flexDirection="column">
      <Panel title="Financial Overview" color="green">
        <Stat label="Net worth" value={money(data.networth)} />
        {data.savings !== null && <Stat label="Savings" value={money(data.savings)} />}
        {data.investments && (
          <Stat
            label="Investments"
            value={money(data.investments.total)}
            hint={data.investments.xirr !== null ? `(XIRR ${(data.investments.xirr * 100).toFixed(2)}%)` : undefined}
          />
        )}
      </Panel>

      {data.allocations.length > 0 && (
        <Panel title="Allocations" color="blue">
          {data.allocations.map(a => (
            <Box key={a.name}>
              <Box width={24}>
                <Text wrap="truncate">{a.name}</Text>
              </Box>
              <Box width={16} justifyContent="flex-end">
                <Text color={a.total < 0 ? 'red' : undefined}>{money(a.total)}</Text>
              </Box>
            </Box>
          ))}
        </Panel>
      )}
    </Box>
  )
}
