'use client'

import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Brush } from 'recharts'
import { useState, useMemo } from 'react'
import { currency_fmt } from '@/app/_utils/currency_formatter'
import { useTheme } from './ThemeProvider'
import { usePrivacy } from './PrivacyProvider'
import { MaskedAmount } from './MaskedAmount'

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
  const { masking_enabled, mask_threshold, reveal_all } = usePrivacy()

  // Mirror MaskedAmount: when masking hides these figures as text, the chart's axis and
  // tooltip must not print them either.
  const amountsHidden =
    masking_enabled && !reveal_all && points.some(p => Math.abs(p.invested) > mask_threshold || Math.abs(p.current) > mask_threshold)
  const fmtAmount = (v: number) => (amountsHidden ? '₹•••••' : currency_fmt.format(v))

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
  const gainPct = last.invested !== 0 ? (gain / last.invested) * 100 : null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Drag the strip handles below to zoom</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Gain</p>
          <p className={`text-base sm:text-lg font-semibold ${gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            <MaskedAmount value={gain} />
            {gainPct !== null && <span className="ml-1 text-xs font-normal">({gainPct.toFixed(1)}%)</span>}
          </p>
        </div>
      </div>
      <div className="w-full h-72 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="brushColorInvested" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="brushColorCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtAxisDate}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-500 dark:text-slate-400"
              minTickGap={40}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={v => compactFmt.format(v as number)}
              tick={amountsHidden ? false : { fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-500 dark:text-slate-400"
              width={amountsHidden ? 8 : 52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickFormatter={v => `${((v as number) * 100).toFixed(0)}%`}
              tick={{ fontSize: 11 }}
              stroke="#f59e0b"
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
                backgroundColor: isDark ? 'rgb(30 41 59)' : 'rgb(255 255 255)',
                border: `1px solid ${isDark ? 'rgb(51 65 85)' : 'rgb(226 232 240)'}`,
                borderRadius: 8,
                color: isDark ? 'rgb(241 245 249)' : 'rgb(15 23 42)',
                fontSize: 12,
              }}
              labelStyle={{ color: isDark ? 'rgb(148 163 184)' : 'rgb(100 116 139)', marginBottom: 4 }}
            />
            <Legend
              formatter={value => <span className="text-xs text-slate-700 dark:text-slate-300 capitalize">{value}</span>}
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="invested"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#brushColorInvested)"
              isAnimationActive={false}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="current"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#brushColorCurrent)"
              isAnimationActive={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="xirr"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Brush
              dataKey="date"
              height={28}
              stroke="#3b82f6"
              fill="rgba(59, 130, 246, 0.05)"
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
