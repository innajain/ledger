import React from 'react'
import { Text } from 'ink'

/** Consistent loading / error / empty placeholders shared by every screen. */
export const Loading = ({ label }: { label: string }) => <Text color="yellow">{label}</Text>

export const ErrorView = ({ message }: { message: string }) => <Text color="red">✗ {message}</Text>

export const Empty = ({ label }: { label: string }) => (
  <Text color="gray" dimColor>
    {label}
  </Text>
)
