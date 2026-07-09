'use client'

import { useEffect } from 'react'
import { useToast } from './Toast'

type QueryEvent =
  | { kind: 'db'; model?: string; action?: string; duration_ms: number; error?: boolean; replayed?: boolean }
  | { kind: 'redis'; op: string; duration_ms: number; hit?: boolean; error?: boolean; replayed?: boolean }

function format(ev: QueryEvent): string {
  const ms = `${Math.round(ev.duration_ms)}ms`
  if (ev.kind === 'db') {
    const label = `${ev.model ?? '?'}.${ev.action ?? '?'}`
    return `DB · ${label} (${ms})`
  }
  const hit = ev.kind === 'redis' && ev.op === 'get' ? (ev.hit ? ' HIT' : ' MISS') : ''
  return `Redis · ${ev.op}${hit} (${ms})`
}

export function DevQueryToaster() {
  const { showToast } = useToast()

  useEffect(() => {
    const es = new EventSource('/api/dev/queries')
    es.onmessage = e => {
      try {
        const ev = JSON.parse(e.data) as QueryEvent
        const type = ev.error ? 'error' : ev.replayed ? 'warning' : 'info'
        showToast(format(ev), type)
      } catch {}
    }
    es.onerror = () => {}
    return () => es.close()
  }, [showToast])

  return null
}
