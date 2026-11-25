'use client'

import { MaskedAmount } from './MaskedAmount'
import { usePrivacy } from './PrivacyProvider'
import { USER_TIMEZONE } from '@/lib/config'

export type SparkPoint = { date: string; value: number }

type Props = {
  points: SparkPoint[]
  days: number
}

// Axis labels at either end of the line, in the ledger's own timezone.
const axis_fmt = new Intl.DateTimeFormat('en-IN', { timeZone: USER_TIMEZONE, day: 'numeric', month: 'short' })

const WIDTH = 100
const HEIGHT = 32
const PAD = 3

function build_path(points: SparkPoint[]): { line: string; area: string } {
  const values = points.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const step = points.length > 1 ? WIDTH / (points.length - 1) : 0

  const coords = points.map((p, i) => {
    const x = i * step
    // A flat series sits on the mid-line instead of collapsing onto an edge.
    const ratio = span === 0 ? 0.5 : (p.value - min) / span
    const y = HEIGHT - PAD - ratio * (HEIGHT - 2 * PAD)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const line = `M${coords.join(' L')}`
  return { line, area: `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z` }
}

export function HomeNetWorthSparkline({ points, days }: Props) {
  const { graphs_visible, masking_enabled, mask_threshold, reveal_all } = usePrivacy()
  if (points.length < 2) return null

  const first = points[0].value
  const last = points[points.length - 1].value
  const change = last - first
  // The absolute change is often small enough to sit under the mask threshold and show in
  // the clear — that's fine on its own, but pairing it with a percentage lets anyone solve
  // `base = change / pct` and recover the masked total above. Hide the percentage whenever
  // either endpoint is itself something the mask would hide, even though the delta isn't.
  const total_masked = masking_enabled && !reveal_all && (Math.abs(first) > mask_threshold || Math.abs(last) > mask_threshold)
  const pct = !total_masked && first !== 0 ? (change / Math.abs(first)) * 100 : null
  const tone = change > 0 ? 'text-pos' : change < 0 ? 'text-neg' : 'text-ink-3'
  const { line } = build_path(points)

  return (
    <div>
      {graphs_visible && (
        <>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" className="h-20 w-full text-ink">
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
        over the last {days} days
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
