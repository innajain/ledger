import React from 'react'
import { Box, Text } from 'ink'

/** A column definition for {@link DataTable}. */
export type Column<T> = {
  header: string
  /** Fixed column width in characters. */
  width: number
  /** Right-align the cell + header (use for numeric columns). */
  align?: 'right'
  cell: (row: T) => string
  /** Optional per-row text colour (e.g. red for negatives). */
  color?: (row: T) => string | undefined
  /** Static colour applied to every cell in the column (e.g. dim ids). */
  fixedColor?: string
}

const GAP = 2

/**
 * A small aligned table for the Ink UI: fixed-width columns, a rule whose width
 * tracks the columns, optional right alignment and per-cell colour.
 *
 * - `selectedIndex` highlights that row (an interactive cursor).
 * - `maxRows` caps how many rows render at once; the visible window follows the
 *   cursor and `↑/↓ N more` markers show what's scrolled off (so long lists like
 *   the accounting heads don't overflow the terminal).
 */
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
  // Centre the cursor in the window, clamped to the list bounds.
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
