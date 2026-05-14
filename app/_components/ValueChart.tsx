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
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null)
  const currentRange = zoomRange || [0, Math.max(0, points.length - 1)]

  // Filter points based on zoom range
  const visiblePoints = useMemo(() => {
    return points.slice(Math.floor(currentRange[0]), Math.ceil(currentRange[1]) + 1)
  }, [points, currentRange])

  // Subsample dense series for rendering: cap at ~365 points.
  const sampled = useMemo(() => {
    if (visiblePoints.length <= 365) return visiblePoints
    const stride = Math.ceil(visiblePoints.length / 365)
    const out: ValuePoint[] = []
    for (let i = 0; i < visiblePoints.length; i += stride) out.push(visiblePoints[i])
    if (out[out.length - 1]?.date !== visiblePoints[visiblePoints.length - 1].date) out.push(visiblePoints[visiblePoints.length - 1])
    return out
  }, [visiblePoints])

  // Drag selection in progress.
  // (Removed brush state)

  // Recompute y domain to fit only the visible x range
  const yDomain = useMemo<[number, number]>(() => {
    if (sampled.length === 0) return [0, 0]
    let min = Infinity
    let max = -Infinity
    for (const p of sampled) {
      if (p.invested < min) min = p.invested
      if (p.current < min) min = p.current
      if (p.invested > max) max = p.invested
      if (p.current > max) max = p.current
    }
    // small padding so areas don't touch the top/bottom
    const pad = (max - min) * 0.05 || Math.abs(max) * 0.05 || 1
    return [min - pad, max + pad]
  }, [sampled])

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

  // Panning state
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouseX, setLastMouseX] = useState<number | null>(null)
  // Zooming state (pinch)
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null)

  const applyZoom = (delta: number) => {
    // scale factor
    const zoomFactor = 0.1
    const range = currentRange[1] - currentRange[0]
    if (range <= 0) return

    // Limit zoom in to at least 10 points
    if (delta < 0 && range <= 10) return

    let newStart = currentRange[0] - delta * range * zoomFactor
    let newEnd = currentRange[1] + delta * range * zoomFactor

    // constrain to data bounds
    newStart = Math.max(0, newStart)
    newEnd = Math.min(points.length - 1, newEnd)

    if (newEnd - newStart < 10 && points.length > 10) {
      const mid = (newStart + newEnd) / 2
      newStart = Math.max(0, mid - 5)
      newEnd = Math.min(points.length - 1, mid + 5)
    }

    setZoomRange([newStart, newEnd])
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Zoom in/out based on wheel delta
    applyZoom(e.deltaY > 0 ? 1 : -1)
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setLastMouseX(e.clientX)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || lastMouseX === null) return
    handleDrag(e.clientX)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setLastMouseX(null)
    setLastPinchDist(null)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      setIsDragging(true)
      setLastMouseX(e.touches[0].clientX)
      setLastPinchDist(null)
    } else if (e.touches.length === 2) {
      setIsDragging(false)
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      setLastPinchDist(dist)
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDragging && lastMouseX !== null) {
      handleDrag(e.touches[0].clientX)
    } else if (e.touches.length === 2 && lastPinchDist !== null) {
      // Pinch to zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      
      // If distance gets smaller (pinch inward), distDiff is positive -> zoom out (positive delta)
      // If distance gets larger (pinch outward), distDiff is negative -> zoom in (negative delta)
      const distDiff = lastPinchDist - dist
      
      // Apply zoom sensitivity
      applyZoom(distDiff / 20)
      setLastPinchDist(dist)
    }
  }

  const handleDrag = (clientX: number) => {
    const deltaX = clientX - lastMouseX!
    setLastMouseX(clientX)

    // Pan
    const range = currentRange[1] - currentRange[0]
    // approximate px per item
    const shift = -(deltaX / 300) * range // assume container ~300px wide for sensitivity

    let newStart = currentRange[0] + shift
    let newEnd = currentRange[1] + shift

    // clamp
    if (newStart < 0) {
      newEnd -= newStart
      newStart = 0
    }
    if (newEnd > points.length - 1) {
      newStart -= newEnd - (points.length - 1)
      newEnd = points.length - 1
    }

    newStart = Math.max(0, newStart)
    newEnd = Math.min(points.length - 1, newEnd)

    setZoomRange([newStart, newEnd])
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Scroll or pinch to zoom • Drag to pan
            {zoomRange && (
              <>
                {' • '}
                <button onClick={() => setZoomRange(null)} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
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
      <div
        className="w-full h-64 sm:h-80 select-none touch-pan-y cursor-grab active:cursor-grabbing outline-none"
        style={{ WebkitTapHighlightColor: 'transparent' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
        onTouchCancel={handleMouseUp}
      >
        <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none focus-visible:outline-none">
          <AreaChart data={sampled} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} onClick={(e) => e && (e as any).event?.preventDefault()} style={{ outline: 'none' }}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-700" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtAxisDate}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-500 dark:text-slate-400"
              minTickGap={40}
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
              cursor={false}
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
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
