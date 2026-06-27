import React, { useState } from 'react'
import { Text, Box } from 'ink'
import TextInput from 'ink-text-input'

type Props = {
  onLogin: (u: string, p: string) => Promise<boolean>
}

export function Login({ onLogin }: Props) {
  const [step, setStep] = useState<'username' | 'password'>('username')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (step === 'username') {
      if (username.trim()) setStep('password')
    } else {
      if (!password) return
      setLoading(true)
      setError('')
      const success = await onLogin(username.trim(), password)
      if (!success) {
        setError('Invalid credentials')
        setLoading(false)
        setStep('username')
        setUsername('')
        setPassword('')
      }
    }
  }

  return (
    <Box flexDirection="column" padding={2} borderStyle="round" borderColor="cyan">
      <Text color="cyan" bold>
        Ledger Login
      </Text>
      <Box marginY={1} flexDirection="column">
        {error && <Text color="red">✗ {error}</Text>}
        {loading ? (
          <Text color="yellow">Logging in...</Text>
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
    </Box>
  )
}
