'use client'

import { MaskedAmount } from './MaskedAmount'
import { usePrivacy } from './PrivacyProvider'

export type SparkPoint = { date: string; value: number }

type Props = {
  points: SparkPoint[]
  days: number
}

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
  const tone =
    change > 0 ? 'text-green-600 dark:text-green-400' : change < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
  const { line, area } = build_path(points)

  return (
    <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Last {days} days</p>
          {/* no manual sign: currency_fmt is signDisplay:'exceptZero', and the masked form drops
              the sign on purpose */}
          <p className={`text-sm font-semibold ${tone}`}>
            <MaskedAmount value={change} />
            {pct !== null && (
              <span className="font-normal">
                {' '}
                ({pct >= 0 ? '+' : ''}
                {pct.toFixed(1)}%)
              </span>
            )}
          </p>
        </div>
        {graphs_visible && (
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" className={`h-12 w-32 sm:w-48 shrink-0 ${tone}`}>
            <path d={area} fill="currentColor" opacity={0.12} />
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
        )}
      </div>
    </div>
  )
}

export function HomeNetWorthSparklineFallback({ days }: { days: number }) {
  return (
    <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 animate-pulse">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Last {days} days</p>
          <div className="mt-1 h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
        <div className="h-12 w-32 sm:w-48 shrink-0 rounded bg-slate-100 dark:bg-slate-700/50" />
      </div>
    </div>
  )
}
