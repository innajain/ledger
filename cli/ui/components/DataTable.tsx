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
 * tracks the columns (no more hand-counted `'─'.repeat(N)`), optional right
 * alignment and per-cell colour. Replaces the per-screen hand-rolled tables.
 */
export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  const ruleWidth = columns.reduce((w, c) => w + c.width, 0) + GAP * (columns.length - 1)
  const justify = (c: Column<T>) => (c.align === 'right' ? 'flex-end' : 'flex-start')

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
      {rows.map((row, ri) => (
        <Box key={ri}>
          {columns.map((c, ci) => (
            <Box key={ci} width={c.width} marginRight={ci < columns.length - 1 ? GAP : 0} justifyContent={justify(c)}>
              <Text color={c.color?.(row) ?? c.fixedColor} wrap="truncate">
                {c.cell(row)}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}
