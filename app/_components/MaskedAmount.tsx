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

// Keep currency symbol, sign, and spacing, strip digits/groups/decimals.
function build_mask(value: number, formatter: Intl.NumberFormat): string {
  const parts = formatter.formatToParts(value)
  let prefix = ''
  for (const part of parts) {
    if (part.type === 'integer' || part.type === 'group' || part.type === 'decimal' || part.type === 'fraction') continue
    prefix += part.value
  }
  return `${prefix}${BULLETS}`.trimStart()
}

export function MaskedAmount({ value, precise = false, className }: Props) {
  const { masking_enabled, mask_threshold } = usePrivacy()
  const formatter = precise ? precise_currency_fmt : currency_fmt
  const formatted = formatter.format(value)

  // Initial visibility is decided once at mount from the threshold. User clicks
  // flip the local state; later threshold changes don't override prior clicks.
  const [hidden, setHidden] = useState(() => Math.abs(value) > mask_threshold)

  if (!masking_enabled) return <span className={className}>{formatted}</span>

  const toggle = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setHidden(h => !h)
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
