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
  { label: 'Home', value: 'home' },
  { label: 'Assets', value: 'assets' },
  { label: 'Accounts', value: 'accounts' },
  { label: 'Allocations', value: 'allocations' },
  { label: 'Income/Expenses', value: 'income_expense' },
  { label: 'Transactions', value: 'transactions' },
  { label: 'Requests', value: 'requests' },
  { label: 'Holdings', value: 'holdings' },
  { label: 'Balances', value: 'balances' },
  { label: 'Templates', value: 'templates' },
]

const MENU = [...TABS, { label: 'Logout', value: 'logout' }, { label: 'Exit', value: 'exit' }]

export function App() {
  const { session, loading, login, signup, logout } = useSession()
  const { exit } = useApp()
  const [tab, setTab] = useState('home')
  const [focus, setFocus] = useState<'menu' | 'content'>('menu')
  const [navContext, setNavContext] = useState<string | null>(null)

  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) exit()
      else if (key.rightArrow || key.return) setFocus('content')
    },
    { isActive: !!session && focus === 'menu' },
  )

  if (loading) return <Text color="yellow">Loading session…</Text>
  if (!session) return <Login onLogin={login} onSignup={signup} />

  const handleSelect = (item: { value: string }) => {
    if (item.value === 'exit') exit()
    else if (item.value === 'logout') logout()
    else {
      setTab(item.value)
      setNavContext(null)
      setFocus('content')
    }
  }

  const handleNavigate = (newTab: string, context?: string | null) => {
    setTab(newTab)
    setNavContext(context || null)
    setFocus('content')
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
          {tab === 'home' && <Dashboard uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} />}
          {tab === 'assets' && <Assets uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} navContext={navContext} />}
          {tab === 'accounts' && (
            <Heads uid={session.uid} active={active} onExit={onExit} initialType="account" onNavigate={handleNavigate} navContext={navContext} />
          )}
          {tab === 'allocations' && (
            <Heads uid={session.uid} active={active} onExit={onExit} initialType="allocation" onNavigate={handleNavigate} navContext={navContext} />
          )}
          {tab === 'income_expense' && (
            <Heads
              uid={session.uid}
              active={active}
              onExit={onExit}
              initialType="income_expense"
              onNavigate={handleNavigate}
              navContext={navContext}
            />
          )}
          {tab === 'transactions' && <Transactions uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} />}
          {tab === 'requests' && <Approvals uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} />}
          {tab === 'holdings' && <Holdings uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} />}
          {tab === 'balances' && <Balances uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} />}
          {tab === 'templates' && <Templates uid={session.uid} active={active} onExit={onExit} onNavigate={handleNavigate} />}
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
