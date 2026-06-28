import React, { useState } from 'react'
import { Text, Box, useInput } from 'ink'
import TextInput from 'ink-text-input'

type Props = {
  onLogin: (u: string, p: string) => Promise<{ success: boolean; error?: string }>
  onSignup: (u: string, p: string) => Promise<{ success: boolean; error?: string }>
}

export function Login({ onLogin, onSignup }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [step, setStep] = useState<'username' | 'password'>('username')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useInput((input, key) => {
    if (step === 'username' && key.tab) {
      setMode(m => (m === 'login' ? 'signup' : 'login'))
      setUsername('')
      setPassword('')
      setError('')
    }
  })

  const handleSubmit = async () => {
    if (step === 'username') {
      if (username.trim()) setStep('password')
    } else {
      if (!password) return
      setLoading(true)
      setError('')
      const res = mode === 'login' ? await onLogin(username.trim(), password) : await onSignup(username.trim(), password)
      if (!res.success) {
        setError(res.error || 'Failed')
        setLoading(false)
        setStep('username')
        setUsername('')
        setPassword('')
      }
    }
  }

  return (
    <Box flexDirection="column" padding={2} borderStyle="round" borderColor={mode === 'login' ? 'cyan' : 'magenta'}>
      <Text color={mode === 'login' ? 'cyan' : 'magenta'} bold>
        Ledger {mode === 'login' ? 'Login' : 'Signup'}
      </Text>
      <Box marginY={1} flexDirection="column">
        {error && <Text color="red">✗ {error}</Text>}
        {loading ? (
          <Text color="yellow">{mode === 'login' ? 'Logging in...' : 'Signing up...'}</Text>
        ) : (
          <>
            <Box>
              <Text>Username: </Text>
              {step === 'username' ? (
                <TextInput value={username} onChange={setUsername} onSubmit={handleSubmit} />
              ) : (
                <Text color="green">{username}</Text>
              )}
            </Box>
            {step === 'password' && (
              <Box>
                <Text>Password: </Text>
                <TextInput value={password} onChange={setPassword} onSubmit={handleSubmit} mask="*" />
              </Box>
            )}
          </>
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {step === 'username' && 'tab switch mode · '}enter submit
        </Text>
      </Box>
    </Box>
  )
}
