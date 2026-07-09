import React from 'react'
import { Box, Text } from 'ink'

export type Column<T> = {
  header: string

  width: number

  align?: 'right'
  cell: (row: T) => string

  color?: (row: T) => string | undefined

  fixedColor?: string
}

const GAP = 2

export function DataTable<T>({
  columns,
  rows,
  selectedIndex,
  maxRows,
}: {
  columns: Column<T>[]
  rows: T[]
  selectedIndex?: number
  maxRows?: number
}) {
  const ruleWidth = columns.reduce((w, c) => w + c.width, 0) + GAP * (columns.length - 1)
  const justify = (c: Column<T>) => (c.align === 'right' ? 'flex-end' : 'flex-start')

  const n = rows.length
  const windowed = maxRows != null && n > maxRows
  const cursor = selectedIndex ?? 0

  const start = windowed ? Math.min(Math.max(0, cursor - Math.floor(maxRows! / 2)), n - maxRows!) : 0
  const end = windowed ? start + maxRows! : n
  const aboveCount = start
  const belowCount = n - end

  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((c, i) => (
          <Box key={i} width={c.width} marginRight={i < columns.length - 1 ? GAP : 0} justifyContent={justify(c)}>
            <Text bold>{c.header}</Text>
          </Box>
        ))}
      </Box>
      <Text color="gray">{'─'.repeat(ruleWidth)}</Text>
      {aboveCount > 0 && <Text color="gray">↑ {aboveCount} more</Text>}
      {rows.slice(start, end).map((row, i) => {
        const ri = start + i
        const selected = ri === selectedIndex
        return (
          <Box key={ri}>
            {columns.map((c, ci) => (
              <Box key={ci} width={c.width} marginRight={ci < columns.length - 1 ? GAP : 0} justifyContent={justify(c)}>
                <Text color={selected ? 'black' : (c.color?.(row) ?? c.fixedColor)} backgroundColor={selected ? 'cyan' : undefined} wrap="truncate">
                  {c.cell(row)}
                </Text>
              </Box>
            ))}
          </Box>
        )
      })}
      {belowCount > 0 && <Text color="gray">↓ {belowCount} more</Text>}
    </Box>
  )
}
