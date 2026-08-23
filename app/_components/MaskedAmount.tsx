'use client'

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { currency_fmt, precise_currency_fmt } from '../_utils/currency_formatter'
import { usePrivacy } from './PrivacyProvider'

type Props = {
  value: number
  precise?: boolean
  className?: string
}

const BULLETS = '•••••'

/**
 * Keeps only the currency symbol (plus any literal spacing around it) so a masked
 * amount reads as `₹•••••`. The +/- sign is dropped on purpose: showing it would leak
 * the direction of the flow, which is exactly what the mask is meant to hide.
 */
function build_mask(value: number, formatter: Intl.NumberFormat): string {
  const parts = formatter.formatToParts(value)
  let prefix = ''
  for (const part of parts) {
    if (part.type !== 'currency' && part.type !== 'literal') continue
    prefix += part.value
  }
  return `${prefix}${BULLETS}`.trimStart()
}

export function MaskedAmount({ value, precise = false, className }: Props) {
  const { masking_enabled, mask_threshold, reveal_all, reveal_epoch } = usePrivacy()
  const formatter = precise ? precise_currency_fmt : currency_fmt
  const formatted = formatter.format(value)

  // Per-instance click-to-toggle, tagged with the reveal epoch it was made in. Flipping
  // the global switch bumps the epoch, so stale overrides are dropped while deriving
  // `hidden` below — no effect, nothing to sync.
  const [override, setOverride] = useState<{ epoch: number; hidden: boolean } | null>(null)

  if (!masking_enabled) return <span className={className}>{formatted}</span>

  const current_override = override !== null && override.epoch === reveal_epoch ? override.hidden : null
  const hidden = current_override ?? (!reveal_all && Math.abs(value) > mask_threshold)

  const toggle = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOverride({ epoch: reveal_epoch, hidden: !hidden })
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') toggle(e)
      }}
      title={hidden ? 'Click to reveal' : 'Click to hide'}
      aria-label={hidden ? 'Hidden amount, click to reveal' : `${formatted}, click to hide`}
      className={`${className ?? ''} cursor-pointer select-none${hidden ? ' tracking-wider' : ''}`}
    >
      {hidden ? build_mask(value, formatter) : formatted}
    </span>
  )
}
