'use client'

import { useEffect, useRef } from 'react'
import { createChart, AreaSeries, ColorType, type IChartApi, type ISeriesApi, type Time } from 'lightweight-charts'
import { useTheme } from 'next-themes'
import { currency_fmt } from '@/app/_utils/currency_formatter'

export type ValuePoint = {
  date: string
  invested: number
  current: number
}

type Props = {
  points: ValuePoint[]
  title?: string
}

export function ValueChartLightweight({ points, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const investedSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const currentSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const { resolvedTheme } = useTheme()

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return

    const isDark = resolvedTheme === 'dark'
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#64748b',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: isDark ? '#334155' : '#e2e8f0' },
      },
      rightPriceScale: {
        borderColor: isDark ? '#334155' : '#e2e8f0',
      },
      timeScale: {
        borderColor: isDark ? '#334155' : '#e2e8f0',
        timeVisible: false,
        secondsVisible: false,
        // Constrain panning so the user can't drift past the data on either side.
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: { mode: 1 },
      autoSize: true,
      localization: {
        priceFormatter: (v: number) => currency_fmt.format(v),
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      // Disable built-in mouse-wheel scaling; we attach our own faster wheel handler below.
      handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
    })

    const investedSeries = chart.addSeries(AreaSeries, {
      lineColor: '#3b82f6',
      topColor: 'rgba(59, 130, 246, 0.3)',
      bottomColor: 'rgba(59, 130, 246, 0)',
      lineWidth: 2,
      title: 'Invested',
    })
    const currentSeries = chart.addSeries(AreaSeries, {
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.3)',
      bottomColor: 'rgba(16, 185, 129, 0)',
      lineWidth: 2,
      title: 'Current',
    })

    chartRef.current = chart
    investedSeriesRef.current = investedSeries
    currentSeriesRef.current = currentSeries

    // Custom wheel zoom: ~25% per tick (built-in is too gentle), centered on
    // the cursor's logical position, clamped to data bounds.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ts = chart.timeScale()
      const range = ts.getVisibleLogicalRange()
      if (!range) return
      const span = range.to - range.from
      if (span <= 0) return

      const rect = containerRef.current!.getBoundingClientRect()
      const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const cursorLogical = range.from + xRatio * span
      const zoomFactor = e.deltaY > 0 ? 1.06 : 0.94
      const newSpan = Math.max(2, span * zoomFactor)

      ts.setVisibleLogicalRange({
        from: cursorLogical - xRatio * newSpan,
        to: cursorLogical + (1 - xRatio) * newSpan,
      })
    }
    const el = containerRef.current
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('wheel', onWheel)
      chart.remove()
      chartRef.current = null
      investedSeriesRef.current = null
      currentSeriesRef.current = null
    }
  }, [resolvedTheme])

  // Update data
  useEffect(() => {
    if (!investedSeriesRef.current || !currentSeriesRef.current) return
    investedSeriesRef.current.setData(points.map(p => ({ time: p.date as Time, value: p.invested })))
    currentSeriesRef.current.setData(points.map(p => ({ time: p.date as Time, value: p.current })))
    chartRef.current?.timeScale().fitContent()
  }, [points])

  if (points.length === 0) return null

  const last = points[points.length - 1]
  const gain = last.current - last.invested
  const gainPct = last.invested !== 0 ? (gain / last.invested) * 100 : null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 sm:p-6 transition-colors">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Scroll/pinch to zoom • Drag to pan • Double-click axis to reset</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Gain</p>
          <p className={`text-base sm:text-lg font-semibold ${gain >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {currency_fmt.format(gain)}
            {gainPct !== null && <span className="ml-1 text-xs font-normal">({gainPct.toFixed(1)}%)</span>}
          </p>
        </div>
      </div>
      <div ref={containerRef} className="w-full h-64 sm:h-80" />
    </div>
  )
}
