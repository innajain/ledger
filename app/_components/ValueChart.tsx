'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/app/_components/Button'
import { usePrivacy } from './PrivacyProvider'

const ValueChartBrush = dynamic(() => import('./ValueChartBrush').then(m => ({ default: m.ValueChartBrush })), {
  ssr: false,
  loading: () => <div className="h-90 flex items-center justify-center text-sm text-ink-3">Loading chart…</div>,
})

const ValueChartLightweight = dynamic(() => import('./ValueChartLightweight').then(m => ({ default: m.ValueChartLightweight })), {
  ssr: false,
  loading: () => <div className="h-90 flex items-center justify-center text-sm text-ink-3">Loading chart…</div>,
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

type View = 'brush' | 'lightweight'
const STORAGE_KEY = 'value-chart-view'

export function ValueChart({ points, title }: Props) {
  const [view, setView] = useState<View>('lightweight')
  const { graphs_visible, set_graphs_visible } = usePrivacy()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === 'brush' || saved === 'lightweight') setView(saved)
    } catch {}
  }, [])

  const choose = (next: View) => {
    setView(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {}
  }

  if (!graphs_visible) {
    return (
      <div className="bg-paper border border-rule rounded-lg p-4 flex items-center justify-between gap-3">
        <div>
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          <p className="text-xs text-ink-3 mt-1">Graph hidden for privacy.</p>
        </div>
        <Button size="sm" variant="primary" onClick={() => set_graphs_visible(true)}>
          Show graph
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => set_graphs_visible(false)}>
          Hide graph
        </Button>
        <div className="inline-flex bg-sunken rounded-lg p-0.5 border border-rule">
          <button
            type="button"
            onClick={() => choose('lightweight')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              view === 'lightweight' ? 'bg-raised text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Interactive
          </button>
          <button
            type="button"
            onClick={() => choose('brush')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              view === 'brush' ? 'bg-raised text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            Slider
          </button>
        </div>
      </div>
      {view === 'lightweight' ? <ValueChartLightweight points={points} title={title} /> : <ValueChartBrush points={points} title={title} />}
    </div>
  )
}
