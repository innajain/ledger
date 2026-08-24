'use client'

import { useEffect, useRef } from 'react'
import { useReportWebVitals } from 'next/web-vitals'

type Vital = { route: string; name: string; value: number; rating?: string; navigationType?: string }

// Metrics buffer locally and flush as ONE beacon when the page is hidden/unloaded —
// per-metric beacons cost five authenticated round trips and five DB inserts per view.
export function WebVitalsReporter() {
  const buffer = useRef(new Map<string, Vital>())

  useReportWebVitals(metric => {
    if (!['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(metric.name)) return
    const route = window.location.pathname
    // Latest value per route+name wins (CLS/INP re-report with growing values).
    buffer.current.set(`${route}:${metric.name}`, {
      route,
      name: metric.name,
      value: metric.value,
      rating: (metric as { rating?: string }).rating,
      navigationType: (metric as { navigationType?: string }).navigationType,
    })
  })

  useEffect(() => {
    const flush = () => {
      if (buffer.current.size === 0) return
      const body = JSON.stringify(Array.from(buffer.current.values()))
      buffer.current.clear()
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/metrics/web-vital', new Blob([body], { type: 'application/json' }))
      } else {
        fetch('/api/metrics/web-vital', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {})
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  return null
}
