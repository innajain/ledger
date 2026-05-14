'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Brush } from 'recharts'
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
            {currency_fmt.format(gain)}
            {gainPct !== null && <span className="ml-1 text-xs font-normal">({gainPct.toFixed(1)}%)</span>}
          </p>
        </div>
      </div>
      <div className="w-full h-72 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
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
              tickFormatter={v => compactFmt.format(v as number)}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-500 dark:text-slate-400"
              width={52}
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
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
            />
            <Area type="monotone" dataKey="invested" stroke="#3b82f6" strokeWidth={2} fill="url(#brushColorInvested)" isAnimationActive={false} />
            <Area type="monotone" dataKey="current" stroke="#10b981" strokeWidth={2} fill="url(#brushColorCurrent)" isAnimationActive={false} />
            <Brush
              dataKey="date"
              height={28}
              stroke="#3b82f6"
              fill="rgba(59, 130, 246, 0.05)"
              tickFormatter={fmtAxisDate}
              travellerWidth={10}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
