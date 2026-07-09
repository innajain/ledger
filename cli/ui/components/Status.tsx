import React from 'react'
import { Text } from 'ink'

export const Loading = ({ label }: { label: string }) => <Text color="yellow">{label}</Text>

export const ErrorView = ({ message }: { message: string }) => <Text color="red">✗ {message}</Text>

export const Empty = ({ label }: { label: string }) => (
  <Text color="gray" dimColor>
    {label}
  </Text>
)
