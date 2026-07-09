import React from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'

export function TextField({
  label,
  value,
  onChange,
  onSubmit,
  mask,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onSubmit?: (v: string) => void
  mask?: string
  placeholder?: string
}) {
  return (
    <Box>
      <Text color="cyan">{label}: </Text>
      <TextInput value={value} onChange={onChange} onSubmit={onSubmit} mask={mask} placeholder={placeholder} />
    </Box>
  )
}

export function Confirm({ message, onAnswer }: { message: string; onAnswer: (yes: boolean) => void }) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') onAnswer(true)
    else if (input === 'n' || input === 'N' || key.escape) onAnswer(false)
  })
  return (
    <Text>
      {message} <Text color="gray">[y/N]</Text>
    </Text>
  )
}
