'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  createChart,
  AreaSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type MouseEventParams,
  type AreaData,
  type LineData,
} from 'lightweight-charts'
import { useTheme } from './ThemeProvider'
import { chart_palette, with_alpha } from '@/app/_utils/chart_palette'
import { usePrivacy } from './PrivacyProvider'
import { currency_fmt } from '@/app/_utils/currency_formatter'

const compactFmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

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

type HoverInfo = {
  date: string
  invested: number
  current: number
  xirr: number | null
  tooltipLeft: number
  tooltipTop: number
} | null

function fmtTooltipDate(s: string) {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ValueChartLightweight({ points, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const investedSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const currentSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const xirrSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const pointsRef = useRef<ValuePoint[]>(points)
  const { resolved_theme } = useTheme()
  const pal = chart_palette(resolved_theme === 'dark')
  const { masking_enabled, mask_threshold, reveal_all, reveal_epoch, request_unmask } = usePrivacy()
  const [hover, setHover] = useState<HoverInfo>(null)

  // Gain, the axis and the tooltip all describe the same holding, so they reveal as one
  // unit rather than each figure toggling independently — mirrors MaskedAmount's
  // per-instance click-to-reveal, just shared across every figure in this chart.
  const [reveal_override, set_reveal_override] = useState<{ epoch: number; hidden: boolean } | null>(null)
  const default_hidden =
    masking_enabled && !reveal_all && points.some(p => Math.abs(p.invested) > mask_threshold || Math.abs(p.current) > mask_threshold)
  const amountsHidden = reveal_override !== null && reveal_override.epoch === reveal_epoch ? reveal_override.hidden : default_hidden
  const fmtAmount = (v: number) => (amountsHidden ? '₹•••••' : currency_fmt.format(v))
  const toggle_reveal = async (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (amountsHidden && !(await request_unmask())) return
    set_reveal_override({ epoch: reveal_epoch, hidden: !amountsHidden })
  }

  useEffect(() => {
    pointsRef.current = points
  }, [points])

  useEffect(() => {
    if (!containerRef.current) return

    const p = chart_palette(resolved_theme === 'dark')
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: p.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: p.grid },
      },

      rightPriceScale: {
        visible: true,
        borderColor: p.grid,
      },
      // Initial value only — toggling the reveal state afterwards updates this via
      // applyOptions() in the effect below rather than recreating the chart, which would
      // tear down the series and, since the data-loading effect only depends on `points`,
      // leave the rebuilt chart with axes but no data.
      leftPriceScale: {
        visible: !amountsHidden,
        borderColor: p.grid,
      },
      timeScale: {
        borderColor: p.grid,
        timeVisible: false,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 0,
        lockVisibleTimeRangeOnResize: true,
      },

      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      autoSize: true,
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
    })

    const getXirrRange = () => {
      if (!chartRef.current) return null
      const logicalRange = chartRef.current.timeScale().getVisibleLogicalRange()
      if (!logicalRange) return null
      const pts = pointsRef.current
      if (!pts || pts.length === 0) return null

      const fromIdx = Math.max(0, Math.floor(logicalRange.from))
      const toIdx = Math.min(pts.length - 1, Math.ceil(logicalRange.to))
      const visiblePoints = pts.slice(fromIdx, toIdx + 1)
      if (visiblePoints.length === 0) return null

      const hasXirr = visiblePoints.some(p => p.xirr !== null)
      if (!hasXirr) return null

      return { priceRange: { minValue: -0.2, maxValue: 0.2 } }
    }

    const investedSeries = chart.addSeries(AreaSeries, {
      lineColor: p.invested,
      topColor: with_alpha(p.invested, 0.12),
      bottomColor: with_alpha(p.invested, 0),
      lineWidth: 1,

      priceScaleId: 'left',

      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: () => null,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => compactFmt.format(v),
        minMove: 0.01,
      },
    })
    const currentSeries = chart.addSeries(AreaSeries, {
      lineColor: p.current,
      topColor: with_alpha(p.current, 0.22),
      bottomColor: with_alpha(p.current, 0),
      lineWidth: 2,
      priceScaleId: 'left',
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => compactFmt.format(v),
        minMove: 0.01,
      },
    })

    const xirrSeries = chart.addSeries(LineSeries, {
      color: p.xirr,
      lineWidth: 2,
      lineStyle: 2,
      priceScaleId: 'right',
      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: getXirrRange,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => `${(v * 100).toFixed(1)}%`,
        minMove: 0.0001,
      },
    })

    chartRef.current = chart
    investedSeriesRef.current = investedSeries
    currentSeriesRef.current = currentSeries
    xirrSeriesRef.current = xirrSeries

    const onCrosshairMove = (param: MouseEventParams) => {
      if (!param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
        setHover(null)
        return
      }
      const inv = param.seriesData.get(investedSeries) as AreaData | undefined
      const cur = param.seriesData.get(currentSeries) as AreaData | undefined
      const xir = param.seriesData.get(xirrSeries) as LineData | undefined
      if (inv == null || cur == null) {
        setHover(null)
        return
      }
      const containerWidth = containerRef.current?.clientWidth ?? 0
      setHover({
        date: param.time as string,
        invested: inv.value,
        current: cur.value,
        xirr: xir?.value ?? null,
        tooltipLeft: Math.min(param.point.x + 12, containerWidth - 180),
        tooltipTop: Math.max(8, param.point.y - 60),
      })
    }
    chart.subscribeCrosshairMove(onCrosshairMove)

    const onWheel = (e: WheelEvent) => {
      // Plain scrolling belongs to the page; the chart zooms only when asked for
      // with a modifier, so it never traps the wheel.
      if (!e.ctrlKey && !e.metaKey) return
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
      chart.unsubscribeCrosshairMove(onCrosshairMove)
      chart.remove()
      chartRef.current = null
      investedSeriesRef.current = null
      currentSeriesRef.current = null
    }
    // amountsHidden intentionally excluded: it only seeds the initial leftPriceScale.visible —
    // later changes apply via the effect below instead of recreating the chart (see comment above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved_theme])

  useEffect(() => {
    if (!investedSeriesRef.current || !currentSeriesRef.current || !xirrSeriesRef.current) return
    investedSeriesRef.current.setData(points.map(p => ({ time: p.date as Time, value: p.invested })))
    currentSeriesRef.current.setData(points.map(p => ({ time: p.date as Time, value: p.current })))

    xirrSeriesRef.current.setData(points.filter(p => p.xirr !== null).map(p => ({ time: p.date as Time, value: p.xirr as number })))
    chartRef.current?.timeScale().fitContent()
  }, [points])

  // Toggling the reveal state updates just this option — recreating the whole chart (see
  // above) would silently drop the series data.
  useEffect(() => {
    chartRef.current?.applyOptions({ leftPriceScale: { visible: !amountsHidden } })
  }, [amountsHidden])

  if (points.length === 0) return null

  const last = points[points.length - 1]
  const gain = last.current - last.invested
  // Same leak as the net-worth sparkline: a masked gain paired with an unmasked percentage
  // lets anyone solve `invested = gain / pct` and recover the masked totals. Hide the
  // percentage whenever the underlying amounts are themselves masked.
  const gainPct = !amountsHidden && last.invested !== 0 ? (gain / last.invested) * 100 : null

  const tooltipStyle: React.CSSProperties | undefined = hover
    ? {
        position: 'absolute',
        left: hover.tooltipLeft,
        top: hover.tooltipTop,
        pointerEvents: 'none',
      }
    : undefined

  return (
    <div className="sheet p-4 sm:p-6">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          {title && <h2 className="text-xl font-medium text-ink">{title}</h2>}
          <p className="text-xs text-ink-3 mt-1">
            {/* The gestures differ by input device, so name only the ones the reader actually has. */}
            <span className="sm:hidden">Pinch to zoom • Drag to pan • Double-tap axis to reset</span>
            <span className="hidden sm:inline">Ctrl+scroll to zoom • Drag to pan • Double-click axis to reset</span>
          </p>
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2" aria-hidden="true">
        {(
          [
            [pal.invested, 'Invested (₹, left)'],
            [pal.current, 'Current value (₹, left)'],
            [pal.xirr, 'XIRR (%, right)'],
          ] as const
        ).map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>
      <div className="relative">
        <div ref={containerRef} className="w-full h-64 sm:h-80" />
        {hover && (
          <div style={tooltipStyle} className="z-10 rounded-md border border-rule-strong bg-raised text-ink px-3 py-2 text-xs shadow-lg">
            <div className="text-ink-3 mb-1">{fmtTooltipDate(hover.date)}</div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: pal.invested }} />
              <span className="text-ink-2">Invested</span>
              <span className="ml-auto font-medium">{fmtAmount(hover.invested)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: pal.current }} />
              <span className="text-ink-2">Current</span>
              <span className="ml-auto font-medium">{fmtAmount(hover.current)}</span>
            </div>
            {hover.xirr !== null && (
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: pal.xirr }} />
                <span className="text-ink-2">XIRR</span>
                <span className={`ml-auto font-medium ${hover.xirr > 0 ? 'text-pos' : hover.xirr < 0 ? 'text-neg' : ''}`}>
                  {(hover.xirr * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
