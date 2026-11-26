'use client'

import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { currency_fmt, plain_currency_fmt, precise_currency_fmt, precise_plain_currency_fmt } from '../_utils/currency_formatter'
import { usePrivacy } from './PrivacyProvider'

type Props = {
  value: number
  precise?: boolean
  /**
   * A balance rather than a flow: no "+" on a positive value (a "-" still shows). Use it
   * for a standalone figure like the net-worth hero, where the sign says nothing and, in
   * the serif face, the "+" sets the figure visibly in from its label.
   */
  plain?: boolean
  className?: string
  /**
   * Render as a click-to-reveal control (the default). Pass false inside links and other
   * interactive rows — nested controls are invalid and add a tab stop per row; the global
   * reveal toggle still applies.
   */
  interactive?: boolean
  /**
   * Keep the +/- sign visible while masked. Off by default because the sign leaks the
   * flow's direction; turn it on where the surrounding UI already shows direction anyway
   * (e.g. the transactions list, which colors and signs every amount).
   */
  keep_sign?: boolean
  /**
   * Set in the tabular mono face (the `num` utility) so amounts line up in a column. Off
   * only for a figure that carries its own face, like a page's serif hero number.
   */
  numeric?: boolean
}

const BULLETS = '•••••'

/**
 * Keeps only the currency symbol (plus any literal spacing around it) so a masked amount
 * reads as `₹•••••` — or `-₹•••••` when `keep_sign` asks for direction to survive.
 */
function build_mask(value: number, formatter: Intl.NumberFormat, keep_sign: boolean): string {
  const parts = formatter.formatToParts(value)
  let prefix = ''
  for (const part of parts) {
    if (part.type === 'currency' || part.type === 'literal') prefix += part.value
    else if (keep_sign && (part.type === 'minusSign' || part.type === 'plusSign')) prefix += part.value
    else if (part.type === 'integer') break
  }
  return `${prefix}${BULLETS}`.trimStart()
}

export function MaskedAmount({
  value,
  precise = false,
  plain = false,
  className: callerClass,
  interactive = true,
  keep_sign = false,
  numeric = true,
}: Props) {
  const className = numeric ? `num${callerClass ? ` ${callerClass}` : ''}` : callerClass
  const { masking_enabled, mask_threshold, reveal_all, reveal_epoch } = usePrivacy()
  const formatter = precise ? (plain ? precise_plain_currency_fmt : precise_currency_fmt) : plain ? plain_currency_fmt : currency_fmt
  const formatted = formatter.format(value)

  // Per-instance click-to-toggle, tagged with the reveal epoch it was made in. Flipping
  // the global switch bumps the epoch, so stale overrides are dropped while deriving
  // `hidden` below — no effect, nothing to sync.
  const [override, setOverride] = useState<{ epoch: number; hidden: boolean } | null>(null)

  if (!masking_enabled) return <span className={className}>{formatted}</span>

  const current_override = interactive && override !== null && override.epoch === reveal_epoch ? override.hidden : null
  const hidden = current_override ?? (!reveal_all && Math.abs(value) > mask_threshold)
  const text = hidden ? build_mask(value, formatter, keep_sign) : formatted

  if (!interactive) {
    // With keep_sign the direction is part of what the row communicates, so the
    // screen-reader name must carry it too — the visible "-"/"+" alone is not
    // reliably voiced.
    const hidden_label = keep_sign && value !== 0 ? `Hidden amount, money ${value > 0 ? 'in' : 'out'}` : 'Hidden amount'
    return (
      <span className={`${className ?? ''}${hidden ? ' tracking-wider' : ''}`} aria-label={hidden ? hidden_label : undefined}>
        {text}
      </span>
    )
  }

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
      {text}
    </span>
  )
}
