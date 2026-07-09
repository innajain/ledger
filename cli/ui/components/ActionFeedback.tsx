import React from 'react'
import { Text } from 'ink'
import type { ActionResult } from '@/app/_actions/_result'

export function ActionFeedback({ result }: { result: ActionResult<unknown> | null }) {
  if (!result) return null
  if (result.success) return <Text color="green">✓ {result.message ?? 'Done'}</Text>
  return (
    <Text color="red">
      ✗ [{result.code}] {result.message}
    </Text>
  )
}
