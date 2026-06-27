import React, { useState } from 'react'
import { Text, Box, useApp, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { useSession } from './hooks/useSession'
import { Login } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { Balances } from './screens/Balances'
import { Transactions } from './screens/Transactions'
import { Holdings } from './screens/Holdings'
import { Approvals } from './screens/Approvals'
import { Heads } from './screens/Heads'
import { Assets } from './screens/Assets'
import { Templates } from './screens/Templates'

const TABS = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Holdings', value: 'holdings' },
  { label: 'Balances', value: 'balances' },
  { label: 'Transactions', value: 'transactions' },
  { label: 'Approvals', value: 'approvals' },
  { label: 'Templates', value: 'templates' },
  { label: 'Heads', value: 'heads' },
  { label: 'Assets', value: 'assets' },
]

const MENU = [...TABS, { label: 'Logout', value: 'logout' }, { label: 'Exit', value: 'exit' }]

export function App() {
  const { session, loading, login, logout } = useSession()
  const { exit } = useApp()
  const [tab, setTab] = useState('dashboard')

  // Quit from anywhere once signed in (login screen owns the keyboard otherwise).
  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) exit()
    },
    { isActive: !!session },
  )

  if (loading) return <Text color="yellow">Loading session…</Text>
  if (!session) return <Login onLogin={login} />

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'exit') exit()
    else if (item.value === 'logout') logout()
    else setTab(item.value)
  }

  const activeLabel = TABS.find(t => t.value === tab)?.label ?? ''

  return (
    <Box flexDirection="column" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Ledger
        </Text>
        <Text color="gray">
          @{session.username} · <Text color="white">{activeLabel}</Text>
        </Text>
      </Box>
      <Text color="gray">{'─'.repeat(64)}</Text>

      <Box flexDirection="row" marginTop={1}>
        <Box width={18} flexDirection="column" marginRight={2}>
          <SelectInput items={MENU} onSelect={handleSelect} />
        </Box>
        <Box flexGrow={1} flexDirection="column">
          {tab === 'dashboard' && <Dashboard uid={session.uid} />}
          {tab === 'holdings' && <Holdings uid={session.uid} />}
          {tab === 'balances' && <Balances uid={session.uid} />}
          {tab === 'transactions' && <Transactions uid={session.uid} />}
          {tab === 'approvals' && <Approvals uid={session.uid} />}
          {tab === 'templates' && <Templates uid={session.uid} />}
          {tab === 'heads' && <Heads uid={session.uid} />}
          {tab === 'assets' && <Assets />}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          ↑↓ navigate · enter open · q quit
        </Text>
      </Box>
    </Box>
  )
}
