'use client'

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { MaskedAmount } from './MaskedAmount'
import { usePrivacy } from './PrivacyProvider'
import { USER_TIMEZONE } from '@/lib/config'

export type SparkPoint = { date: string; value: number }

/**
 * Whether the figure this line belongs to (the home hero) is masked. The hover readout and
 * the % change follow it: reveal the hero and they show, hide it and they hide. Null
 * outside a provider, where the line falls back to the threshold rule.
 */
export const TrendMaskContext = createContext<boolean | null>(null)

type Props = {
  points: SparkPoint[]
  days: number
  /** What the line measures, named in the caption ("in investments"); omitted for net worth. */
  subject?: string
}

// Axis labels at either end of the line, in the ledger's own timezone.
const axis_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: USER_TIMEZONE, day: 'numeric', month: 'short' })
const hover_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: USER_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' })

/** How long a tapped reading stays up after the finger lifts (a mouse clears it on leave). */
const TOUCH_READOUT_MS = 2000

const WIDTH = 100
const HEIGHT = 32
const PAD = 3

/** Each point in viewBox units: x across 0–WIDTH, y down 0–HEIGHT. */
function chart_coords(points: SparkPoint[]): { x: number; y: number }[] {
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0

  return points.map((p, i) => {
    // A flat series sits on the mid-line instead of collapsing onto an edge.
    const ratio = span === 0 ? 0.5 : (p.value - min) / span
    return { x: i * step, y: HEIGHT - PAD - ratio * (HEIGHT - 2 * PAD) }
  })
}

export function HomeNetWorthSparkline({ points, days, subject }: Props) {
  const { graphs_visible, masking_enabled, mask_threshold, reveal_all } = usePrivacy()
  const lead_hidden = useContext(TrendMaskContext)
  // Index of the day under the pointer (or finger), shown as a dot and a readout.
  const [hover, setHover] = useState<number | null>(null)
  const touchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(touchTimer.current), [])
  if (points.length < 2) return null

  const first = points[0].value
  const last = points[points.length - 1].value
  const change = last - first
  // The absolute change is often small enough to sit under the mask threshold and show in
  // the clear — that's fine on its own, but pairing it with a percentage lets anyone solve
  // `base = change / pct` and recover the masked total above. Hide the percentage whenever
  // either endpoint is itself something the mask would hide, even though the delta isn't.
  // With the hero revealed, the total is on screen already and the percentage gives nothing away.
  const total_masked = lead_hidden ?? (masking_enabled && !reveal_all && (Math.abs(first) > mask_threshold || Math.abs(last) > mask_threshold))
  const pct = !total_masked && first !== 0 ? (change / Math.abs(first)) * 100 : null
  const tone = change > 0 ? 'text-pos' : change < 0 ? 'text-neg' : 'text-ink-3'
  const coords = chart_coords(points)
  const line = `M${coords.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' L')}`

  function track(e: PointerEvent<HTMLDivElement>) {
    clearTimeout(touchTimer.current)
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setHover(Math.round(ratio * (points.length - 1)))
  }

  const at = hover !== null ? coords[hover] : null
  // Centred over the point, but pinned to an edge near either end so it never spills out.
  const readout_pos: CSSProperties | undefined = at
    ? at.x < 15
      ? { left: 0 }
      : at.x > 85
        ? { right: 0 }
        : { left: `${at.x}%`, transform: 'translateX(-50%)' }
    : undefined

  return (
    <div>
      {graphs_visible && (
        <>
          {/* touch-pan-y: a vertical swipe still scrolls the page, a sideways one scrubs the line. */}
          <div
            className="relative h-20 touch-pan-y"
            onPointerDown={track}
            onPointerMove={track}
            onPointerLeave={e => {
              if (e.pointerType === 'mouse') setHover(null)
            }}
            onPointerUp={e => {
              if (e.pointerType !== 'mouse') touchTimer.current = setTimeout(() => setHover(null), TOUCH_READOUT_MS)
            }}
            onPointerCancel={() => setHover(null)}
          >
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" className={`h-full w-full ${tone}`}>
              <path
                d={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {/* Drawn in HTML, not the SVG: the SVG stretches unevenly, which would squash a dot. */}
            {at && hover !== null && (
              <>
                <div className="pointer-events-none absolute inset-y-0 w-px bg-rule-strong" style={{ left: `${at.x}%` }} />
                <div
                  className={`pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ${tone}`}
                  style={{ left: `${at.x}%`, top: `${(at.y / HEIGHT) * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap border border-rule bg-raised px-2 py-1 text-xs"
                  style={readout_pos}
                >
                  <span className="text-ink-3">{hover_fmt.format(new Date(points[hover].date))}</span>{' '}
                  <MaskedAmount value={points[hover].value} plain interactive={false} hidden={lead_hidden ?? undefined} className="text-ink" />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-between border-t border-rule-strong pt-1 text-xs text-ink-3 num" aria-hidden="true">
            <span>{axis_fmt.format(new Date(points[0].date))}</span>
            <span>{axis_fmt.format(new Date(points[points.length - 1].date))}</span>
          </div>
        </>
      )}
      <p className="mt-2 text-sm text-ink-3">
        {/* no manual sign: currency_fmt is signDisplay:'exceptZero', and the masked form drops
            the sign on purpose */}
        <span className={tone}>
          <MaskedAmount value={change} />
        </span>
        {pct !== null && (
          <span className="num">
            {' '}
            ({pct >= 0 ? '+' : ''}
            {pct.toFixed(1)}%)
          </span>
        )}{' '}
        {subject && `in ${subject} `}over the last {days} days
      </p>
    </div>
  )
}

export function HomeNetWorthSparklineFallback({ days }: { days: number }) {
  return (
    <div className="animate-pulse" aria-label={`Loading the last ${days} days`}>
      <div className="h-20 w-full rounded-sm bg-sunken" />
      <div className="mt-3 h-4 w-48 rounded-sm bg-sunken" />
    </div>
  )
}
