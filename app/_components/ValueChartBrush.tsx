'use client'

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Brush } from 'recharts'
import { useState, useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { useTheme } from './ThemeProvider'
import { chart_palette, with_alpha } from '@/app/_utils/chart_palette'
import { usePrivacy } from './PrivacyProvider'

export type ValuePoint = {
  date: string
  invested: number
  current: number
  xirr: number | null
}

type Props = {
  points: ValuePoint[]
  title?: string
}

const compactFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function fmtAxisDate(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

function fmtTooltipDate(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ValueChartBrush({ points, title }: Props) {
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null)
  const { resolved_theme } = useTheme()
  const isDark = resolved_theme === 'dark'
  const pal = chart_palette(isDark)
  const { masking_enabled, mask_threshold, reveal_all, reveal_epoch } = usePrivacy()

  // Gain, the axis and the tooltip all describe the same holding, so they reveal as one
  // unit rather than each figure toggling independently — mirrors MaskedAmount's
  // per-instance click-to-reveal, just shared across every figure in this chart.
  const [reveal_override, set_reveal_override] = useState<{ epoch: number; hidden: boolean } | null>(null)
  const default_hidden =
    masking_enabled && !reveal_all && points.some(p => Math.abs(p.invested) > mask_threshold || Math.abs(p.current) > mask_threshold)
  const amountsHidden = reveal_override !== null && reveal_override.epoch === reveal_epoch ? reveal_override.hidden : default_hidden
  const fmtAmount = (v: number) => (amountsHidden ? '₹•••••' : currency_fmt.format(v))
  const toggle_reveal = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    set_reveal_override({ epoch: reveal_epoch, hidden: !amountsHidden })
  }

  const domains = useMemo(() => {
    let startIndex = 0
    let endIndex = points.length - 1
    if (brushRange) {
      startIndex = brushRange.startIndex
      endIndex = brushRange.endIndex
    }
    const visiblePoints = points.slice(Math.max(0, startIndex), Math.min(points.length, endIndex + 1))

    const xirrVals = visiblePoints
      .map(p => p.xirr)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
    let rightDomain: [number | string, number | string] = ['auto', 'auto']
    if (xirrVals.length > 0) {
      const x25 = -0.2
      const x75 = 0.2
      if (x25 !== undefined && x75 !== undefined) {
        const pad = (x75 - x25) * 0.05 || Math.abs(x25) * 0.05 || 0.01
        rightDomain = [x25 - pad, x75 + pad]
      }
    }

    return { rightDomain }
  }, [points, brushRange])

  if (points.length === 0) return null

  const last = points[points.length - 1]
  const gain = last.current - last.invested
  // Same leak as the net-worth sparkline: a masked gain paired with an unmasked percentage
  // lets anyone solve `invested = gain / pct` and recover the masked totals. Hide the
  // percentage whenever the underlying amounts are themselves masked.
  const gainPct = !amountsHidden && last.invested !== 0 ? (gain / last.invested) * 100 : null

  return (
    <div className="sheet p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          {title && <h2 className="text-xl font-medium text-ink">{title}</h2>}
          <p className="text-xs text-ink-3 mt-1">Drag the strip handles below to zoom</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-wide text-ink-3">Gain</p>
          <p className={`text-base sm:text-lg font-semibold ${gain >= 0 ? 'text-pos' : 'text-neg'}`}>
            {masking_enabled ? (
              <span
                role="button"
                tabIndex={0}
                onClick={toggle_reveal}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') toggle_reveal(e)
                }}
                title={amountsHidden ? 'Click to reveal' : 'Click to hide'}
                aria-label={amountsHidden ? 'Hidden amount, click to reveal' : `${fmtAmount(gain)}, click to hide`}
                className={`cursor-pointer select-none${amountsHidden ? ' tracking-wider' : ''}`}
              >
                {fmtAmount(gain)}
              </span>
            ) : (
              fmtAmount(gain)
            )}
            {gainPct !== null && <span className="ml-1 text-xs font-normal">({gainPct.toFixed(1)}%)</span>}
          </p>
        </div>
      </div>
      <div className="w-full h-72 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="brushColorInvested" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={pal.invested} stopOpacity={0.15} />
                <stop offset="95%" stopColor={pal.invested} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="brushColorCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={pal.current} stopOpacity={0.25} />
                <stop offset="95%" stopColor={pal.current} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={pal.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fontSize: 11 }} stroke="currentColor" className="text-ink-3" minTickGap={40} />
            <YAxis
              yAxisId="left"
              tickFormatter={v => compactFmt.format(v as number)}
              tick={amountsHidden ? false : { fontSize: 11 }}
              stroke="currentColor"
              className="text-ink-3"
              width={amountsHidden ? 8 : 52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={v => `${((v as number) * 100).toFixed(0)}%`}
              tick={{ fontSize: 11 }}
              stroke={pal.xirr}
              width={42}
              domain={domains.rightDomain}
              allowDataOverflow
            />
            <Tooltip
              cursor={false}
              formatter={(value, name) => {
                if (name === 'xirr') return [`${(Number(value ?? 0) * 100).toFixed(2)}%`, 'XIRR']
                return [fmtAmount(Number(value ?? 0)), name === 'invested' ? 'Invested' : 'Current']
              }}
              labelFormatter={label => (typeof label === 'string' ? fmtTooltipDate(label) : String(label ?? ''))}
              contentStyle={{
                backgroundColor: pal.tooltip_bg,
                border: `1px solid ${pal.tooltip_border}`,
                borderRadius: 4,
                color: pal.tooltip_text,
                fontSize: 12,
              }}
              labelStyle={{ color: pal.tooltip_muted, marginBottom: 4 }}
            />
            <Legend
              formatter={value => <span className="text-xs text-ink-2 capitalize">{value}</span>}
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="invested"
              stroke={pal.invested}
              strokeWidth={1.5}
              fill="url(#brushColorInvested)"
              isAnimationActive={false}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="current"
              stroke={pal.current}
              strokeWidth={2}
              fill="url(#brushColorCurrent)"
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="xirr"
              stroke={pal.xirr}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Brush
              dataKey="date"
              height={28}
              stroke={pal.grid}
              fill={with_alpha(pal.current, 0.05)}
              tickFormatter={fmtAxisDate}
              travellerWidth={10}
              onChange={(e: { startIndex?: number; endIndex?: number }) => {
                if (typeof e.startIndex === 'number' && typeof e.endIndex === 'number') {
                  setBrushRange({ startIndex: e.startIndex, endIndex: e.endIndex })
                }
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
