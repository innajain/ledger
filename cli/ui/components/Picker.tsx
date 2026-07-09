import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export type PickItem = { id: string; name: string; hint?: string }

export function Picker({
  label,
  items,
  onSelect,
  onCancel,
  extra,
}: {
  label: string
  items: PickItem[]
  onSelect: (item: PickItem) => void
  onCancel?: () => void

  extra?: { label: string; onPick: () => void }
}) {
  const [filter, setFilter] = useState('')
  const [raw, setRaw] = useState(0)

  const matches = items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase()))
  const rows: ({ kind: 'extra' } | { kind: 'item'; item: PickItem })[] = [
    ...(extra ? [{ kind: 'extra' as const }] : []),
    ...matches.map(item => ({ kind: 'item' as const, item })),
  ]
  const cursor = rows.length === 0 ? 0 : Math.min(raw, rows.length - 1)
  const WINDOW = 8
  const start = Math.min(Math.max(0, cursor - WINDOW + 1), Math.max(0, rows.length - WINDOW))
  const visible = rows.slice(start, start + WINDOW)

  useInput((input, key) => {
    if (key.escape) {
      onCancel?.()
    } else if (key.downArrow) {
      setRaw(Math.min(rows.length - 1, cursor + 1))
    } else if (key.upArrow) {
      setRaw(Math.max(0, cursor - 1))
    } else if (key.return) {
      const sel = rows[cursor]
      if (!sel) return
      if (sel.kind === 'extra') extra?.onPick()
      else onSelect(sel.item)
    } else if (key.backspace || key.delete) {
      setFilter(filter.slice(0, -1))
      setRaw(0)
    } else if (input && !key.ctrl && !key.meta) {
      setFilter(filter + input)
      setRaw(0)
    }
  })

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">{label}</Text>
        <Text color="gray"> (type to filter, ↑↓ + enter, esc cancel): </Text>
        <Text>{filter}</Text>
        <Text color="gray">▏</Text>
      </Box>
      {rows.length === 0 && <Text color="gray"> (no match)</Text>}
      {visible.map((r, i) => {
        const idx = start + i
        const selected = idx === cursor
        const text = r.kind === 'extra' ? extra!.label : r.item.name + (r.item.hint ? `  ${r.item.hint}` : '')
        return (
          <Text key={idx} color={selected ? 'black' : r.kind === 'extra' ? 'green' : undefined} backgroundColor={selected ? 'cyan' : undefined}>
            {selected ? '▶ ' : '  '}
            {text}
          </Text>
        )
      })}
    </Box>
  )
}
