import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { compute_net_worth, subtree_total, compute_xirr_for_accounts } from '@/app/_core/valuation_core'
import { money } from '../../format'
import { useAsync } from '../hooks/useAsync'
import { Panel } from '../components/Panel'
import { Loading, ErrorView } from '../components/Status'
import type { ScreenProps } from '../types'

type DashboardData = {
  networth: number
  investments: { id: string; total: number; xirr: number | null } | null
  savings: { id: string; total: number } | null
  allocations: { name: string; total: number }[]
}

function Stat({ label, value, color, hint, isFocused }: { label: string; value: string; color?: string; hint?: string; isFocused?: boolean }) {
  return (
    <Box>
      <Box width={16}>
        <Text color={isFocused ? 'magenta' : undefined}>
          {isFocused ? '▶ ' : '  '}
          {label}
        </Text>
      </Box>
      <Text bold color={color}>
        {value}
      </Text>
      {hint ? <Text color="cyan"> {hint}</Text> : null}
    </Box>
  )
}

export function Dashboard({ uid, active, onExit, onNavigate }: ScreenProps) {
  const [focusIdx, setFocusIdx] = useState(0)

  const { data, error } = useAsync<DashboardData>(async () => {
    const { networth, allocations } = await compute_net_worth(uid)
    const invest = subtree_total(allocations, 'Investments')
    const savings = subtree_total(allocations, 'Savings')
    const xirr = invest && invest.total !== 0 ? await compute_xirr_for_accounts(uid, invest.ids, invest.total) : null

    const investId = allocations.find(a => a.name === 'Investments')?.id
    const savingsId = allocations.find(a => a.name === 'Savings')?.id

    return {
      networth,
      investments: invest && investId ? { id: investId, total: invest.total, xirr } : null,
      savings: savings && savingsId ? { id: savingsId, total: savings.total } : null,
      allocations: allocations.filter(a => Math.abs(a.total) >= 0.005).sort((a, b) => b.total - a.total),
    }
  }, [uid])

  useInput(
    (_input, key) => {
      if (key.escape || key.leftArrow) return onExit()

      const navItems = []
      if (data?.savings) navItems.push(data.savings.id)
      if (data?.investments) navItems.push(data.investments.id)

      if (key.upArrow) setFocusIdx(Math.max(0, focusIdx - 1))
      if (key.downArrow) setFocusIdx(Math.min(Math.max(0, navItems.length - 1), focusIdx + 1))

      if (key.return && navItems.length > 0 && onNavigate) {
        onNavigate('allocations', navItems[focusIdx])
      }
    },
    { isActive: active && !!data },
  )

  if (error) return <ErrorView message={error} />
  if (!data) return <Loading label="Loading dashboard…" />

  const hasSavings = data.savings !== null
  const hasInvest = data.investments !== null
  const savingsFocused = focusIdx === 0 && hasSavings
  const investFocused = (focusIdx === 0 && !hasSavings && hasInvest) || (focusIdx === 1 && hasSavings && hasInvest)

  return (
    <Box flexDirection="column">
      <Panel title="Financial Overview" color="green">
        <Stat label="Net worth" value={money(data.networth)} />
        {data.savings !== null && <Stat label="Savings" value={money(data.savings.total)} isFocused={savingsFocused} />}
        {data.investments && (
          <Stat
            label="Investments"
            value={money(data.investments.total)}
            hint={data.investments.xirr !== null ? `(XIRR ${(data.investments.xirr * 100).toFixed(2)}%)` : undefined}
            isFocused={investFocused}
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

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ move · enter open · esc menu
        </Text>
      </Box>
    </Box>
  )
}
