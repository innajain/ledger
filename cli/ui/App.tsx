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
  const [focus, setFocus] = useState<'menu' | 'content'>('menu')

  // The menu owns the keyboard until you enter a screen; the focused screen
  // owns it after that and returns here on Esc (via the onExit prop).
  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) exit()
      else if (key.rightArrow || key.return) setFocus('content')
    },
    { isActive: !!session && focus === 'menu' },
  )

  if (loading) return <Text color="yellow">Loading session…</Text>
  if (!session) return <Login onLogin={login} />

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'exit') exit()
    else if (item.value === 'logout') logout()
    else {
      setTab(item.value)
      setFocus('content')
    }
  }

  const onExit = () => setFocus('menu')
  const active = focus === 'content'
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
          <SelectInput items={MENU} isFocused={focus === 'menu'} onSelect={handleSelect} />
        </Box>
        <Box flexGrow={1} flexDirection="column">
          {tab === 'dashboard' && <Dashboard uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'holdings' && <Holdings uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'balances' && <Balances uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'transactions' && <Transactions uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'approvals' && <Approvals uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'templates' && <Templates uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'heads' && <Heads uid={session.uid} active={active} onExit={onExit} />}
          {tab === 'assets' && <Assets active={active} onExit={onExit} />}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {focus === 'menu' ? '↑↓ navigate · enter open · q quit' : 'esc back to menu'}
        </Text>
      </Box>
    </Box>
  )
}
