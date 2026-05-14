'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea } from 'recharts'
import { useMemo, useState } from 'react'
import { currency_fmt } from '@/app/_utils/currency_formatter'

export type ValuePoint = {
  date: string // 'yyyy-MM-dd'
  invested: number
  current: number
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

export function ValueChart({ points, title }: Props) {
  // Subsample dense series for rendering: cap at ~365 points.
  const sampled = useMemo(() => {
    if (points.length <= 365) return points
    const stride = Math.ceil(points.length / 365)
    const out: ValuePoint[] = []
    for (let i = 0; i < points.length; i += stride) out.push(points[i])
    if (out[out.length - 1]?.date !== points[points.length - 1].date) out.push(points[points.length - 1])
    return out
  }, [points])

  // Zoom state: x-axis domain ['yyyy-MM-dd', 'yyyy-MM-dd'] when zoomed, null otherwise.
  const [zoom, setZoom] = useState<{ left: string; right: string } | null>(null)
  // Drag selection in progress.
  const [refLeft, setRefLeft] = useState<string | null>(null)
  const [refRight, setRefRight] = useState<string | null>(null)

  // Recompute y domain to fit only the visible x range, so zooming actually rescales.
  const yDomain = useMemo<[number, number]>(() => {
    const visible = zoom
      ? sampled.filter(p => p.date >= zoom.left && p.date <= zoom.right)
      : sampled
    if (visible.length === 0) return [0, 0]
    let min = Infinity
    let max = -Infinity
    for (const p of visible) {
      if (p.invested < min) min = p.invested
      if (p.current < min) min = p.current
      if (p.invested > max) max = p.invested
      if (p.current > max) max = p.current
    }
    // small padding so areas don't touch the top/bottom
    const pad = (max - min) * 0.05 || Math.abs(max) * 0.05 || 1
    return [min - pad, max + pad]
  }, [sampled, zoom])

  if (points.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
        {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{title}</h2>}
        <p className="text-sm text-slate-500 dark:text-slate-400">No data to display.</p>
      </div>
    )
  }

  const last = points[points.length - 1]
  const gain = last.current - last.invested
  const gainPct = last.invested !== 0 ? (gain / last.invested) * 100 : null

  const xDomain: [string, string] | undefined = zoom ? [zoom.left, zoom.right] : undefined

  const onMouseDown = (e: { activeLabel?: string | number } | null) => {
    const label = e?.activeLabel != null ? String(e.activeLabel) : null
    if (!label) return
    setRefLeft(label)
    setRefRight(label)
  }
  const onMouseMove = (e: { activeLabel?: string | number } | null) => {
    if (!refLeft) return
    const label = e?.activeLabel != null ? String(e.activeLabel) : null
    if (!label) return
    setRefRight(label)
  }
  const onMouseUp = () => {
    if (refLeft && refRight && refLeft !== refRight) {
      const left = refLeft < refRight ? refLeft : refRight
      const right = refLeft < refRight ? refRight : refLeft
      setZoom({ left, right })
    }
    setRefLeft(null)
    setRefRight(null)
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Drag to zoom into a date range
            {zoom && (
              <>
                {' • '}
                <button onClick={() => setZoom(null)} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Reset zoom
                </button>
              </>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Gain</p>
          <p className={`text-base sm:text-lg font-semibold ${gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {currency_fmt.format(gain)}
            {gainPct !== null && <span className="ml-1 text-xs font-normal">({gainPct.toFixed(1)}%)</span>}
          </p>
        </div>
      </div>
      <div className="w-full h-64 sm:h-80 select-none touch-pan-y">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={sampled}
            margin={{ top: 5, right: 8, left: 0, bottom: 0 }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              setRefLeft(null)
              setRefRight(null)
            }}
            onTouchStart={onMouseDown}
            onTouchMove={onMouseMove}
            onTouchEnd={onMouseUp}
          >
            <defs>
              <linearGradient id="colorInvested" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtAxisDate}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-500 dark:text-slate-400"
              minTickGap={40}
              domain={xDomain}
              type="category"
              allowDataOverflow
            />
            <YAxis
              tickFormatter={v => compactFmt.format(v as number)}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-500 dark:text-slate-400"
              width={52}
              domain={yDomain}
              allowDataOverflow
            />
            <Tooltip
              formatter={(value, name) => [currency_fmt.format(Number(value ?? 0)), name === 'invested' ? 'Invested' : 'Current']}
              labelFormatter={label => (typeof label === 'string' ? fmtTooltipDate(label) : String(label ?? ''))}
              contentStyle={{
                backgroundColor: 'rgb(30 41 59)',
                border: '1px solid rgb(51 65 85)',
                borderRadius: 8,
                color: 'rgb(241 245 249)',
                fontSize: 12,
              }}
              labelStyle={{ color: 'rgb(148 163 184)', marginBottom: 4 }}
            />
            <Legend
              formatter={value => <span className="text-xs text-slate-700 dark:text-slate-300 capitalize">{value}</span>}
              wrapperStyle={{ fontSize: 12 }}
            />
            <Area type="monotone" dataKey="invested" stroke="#3b82f6" strokeWidth={2} fill="url(#colorInvested)" isAnimationActive={false} />
            <Area type="monotone" dataKey="current" stroke="#10b981" strokeWidth={2} fill="url(#colorCurrent)" isAnimationActive={false} />
            {refLeft && refRight && refLeft !== refRight && (
              <ReferenceArea x1={refLeft} x2={refRight} strokeOpacity={0.3} fill="#3b82f6" fillOpacity={0.1} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
