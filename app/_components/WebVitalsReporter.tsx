'use client'

import { useReportWebVitals } from 'next/web-vitals'

export function WebVitalsReporter() {
  useReportWebVitals(metric => {
    if (!['LCP', 'INP', 'CLS', 'FCP', 'TTFB'].includes(metric.name)) return

    const payload = {
      route: window.location.pathname,
      name: metric.name,
      value: metric.value,
      rating: (metric as { rating?: string }).rating,
      navigationType: (metric as { navigationType?: string }).navigationType,
    }
    const body = JSON.stringify(payload)

    // Prefer sendBeacon — survives page unload, never blocks rendering.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon('/api/metrics/web-vital', blob)
    } else {
      fetch('/api/metrics/web-vital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  })

  return null
}
