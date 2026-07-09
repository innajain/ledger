import React from 'react'
import { Box, Text } from 'ink'

export function Panel({ title, color = 'cyan', children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} marginY={1}>
      <Text color={color} bold>
        {title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
    </Box>
  )
}
