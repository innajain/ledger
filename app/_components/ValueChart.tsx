'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { ValueChartLightweight } from './ValueChartLightweight'

const ValueChartBrush = dynamic(() => import('./ValueChartBrush').then(m => ({ default: m.ValueChartBrush })), {
  ssr: false,
  loading: () => <div className="h-[360px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">Loading chart…</div>,
})

export type ValuePoint = {
  date: string // 'yyyy-MM-dd'
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

  // Load saved preference on mount. SSR-safe: initial state matches server render.
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

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => choose('lightweight')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              view === 'lightweight'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Interactive
          </button>
          <button
            type="button"
            onClick={() => choose('brush')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              view === 'brush'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
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
