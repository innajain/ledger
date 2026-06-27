import { useState } from 'react'
import { useInput } from 'ink'

/**
 * A keyboard row cursor over `[0, length)`. ↑/k up, ↓/j down, g/G jump to
 * ends. The index is derived-clamped (never stored out of range) so a shrinking
 * list can't leave the cursor stranded — no setState-in-effect. Gated on `active`.
 */
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

/** Return to the parent (menu) on Esc / ←. Used by the read-only screens. */
export function useExitOnEsc(active: boolean, onExit: () => void): void {
  useInput(
    (_input, key) => {
      if (key.escape || key.leftArrow) onExit()
    },
    { isActive: active },
  )
}
