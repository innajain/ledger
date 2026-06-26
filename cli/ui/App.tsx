import React, { useState } from 'react'
import { Text, Box, useApp } from 'ink'
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

export function App() {
  const { session, loading, login, logout } = useSession()
  const { exit } = useApp()
  const [tab, setTab] = useState('dashboard')

  if (loading) {
    return <Text color="yellow">Loading session...</Text>
  }

  if (!session) {
    return <Login onLogin={login} />
  }

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'exit') {
      exit()
    } else if (item.value === 'logout') {
      logout()
    } else {
      setTab(item.value)
    }
  }

  const items = [
    { label: 'Dashboard', value: 'dashboard' },
    { label: 'Holdings', value: 'holdings' },
    { label: 'Balances', value: 'balances' },
    { label: 'Transactions', value: 'transactions' },
    { label: 'Approvals', value: 'approvals' },
    { label: 'Templates', value: 'templates' },
    { label: 'Heads', value: 'heads' },
    { label: 'Assets', value: 'assets' },
    { label: 'Logout', value: 'logout' },
    { label: 'Exit', value: 'exit' },
  ]

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text color="cyan" bold>
          Ledger Terminal UI
        </Text>
        <Text color="gray">Logged in as {session.username}</Text>
      </Box>

      <Box flexDirection="row">
        <Box width={20} borderStyle="single" borderColor="gray" paddingRight={1} flexDirection="column">
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>

        <Box flexGrow={1} marginLeft={2}>
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
    </Box>
  )
}
