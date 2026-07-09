import { useState } from 'react'
import { useInput, useStdout } from 'ink'

export function useViewportRows(overhead = 12, min = 6): number {
  const { stdout } = useStdout()
  return Math.max(min, (stdout?.rows ?? 24) - overhead)
}

export function useListNav(length: number, active: boolean): readonly [number, (i: number) => void] {
  const [raw, setRaw] = useState(0)
  const cursor = length === 0 ? 0 : Math.min(raw, length - 1)

  useInput(
    (input, key) => {
      if (length === 0) return
      if (key.downArrow || input === 'j') setRaw(Math.min(length - 1, cursor + 1))
      else if (key.upArrow || input === 'k') setRaw(Math.max(0, cursor - 1))
      else if (input === 'g') setRaw(0)
      else if (input === 'G') setRaw(length - 1)
    },
    { isActive: active },
  )

  return [cursor, setRaw] as const
}

export function useExitOnEsc(active: boolean, onExit: () => void): void {
  useInput(
    (_input, key) => {
      if (key.escape || key.leftArrow) onExit()
    },
    { isActive: active },
  )
}
