'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/app/_components/Card'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { format_day } from '@/app/_utils/format_date'
import { recent_interest_periods, type InterestFrequency } from '@/app/_utils/interest_periods'
import type { ActionResult } from '@/app/_actions/_result'
import type { ExpectedInterest } from '@/app/_core/interest_core'

const CUSTOM = 'custom'
const field_classes =
  'px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'
const label_classes = 'block text-sm text-slate-600 dark:text-slate-300 mb-1'

export function InterestCheck({
  headId,
  today,
  getExpectedInterest,
  includeSubheads = false,
  subEntityLabel = 'sub-heads',
}: {
  headId: string
  /**
   * Today's IST day (yyyy-MM-dd), decided by the server. The quarter list and the default
   * period hang off it, so reading the clock here instead would let the server render and
   * the hydration land on different quarters either side of a midnight.
   */
  today: string
  getExpectedInterest: (
    head_id: string,
    from: string,
    to: string,
    rate_pct: number,
    include_subheads?: boolean,
  ) => Promise<ActionResult<ExpectedInterest>>
  /** Follows the head page's scope toggle; callers key the component on it so a flip remounts. */
  includeSubheads?: boolean
  subEntityLabel?: string
}) {
  // Period in progress first, then the completed ones a bank has already paid for. The
  // newest completed one is the default: it is the one with a credit to check against.
  const [frequency, setFrequency] = useState<InterestFrequency>('quarterly')
  const periods = recent_interest_periods(frequency, today, frequency === 'monthly' ? 12 : 4, true)
  const [preset, setPreset] = useState('1')
  const [from, setFrom] = useState(periods[1].from)
  const [to, setTo] = useState(periods[1].to)
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExpectedInterest | null>(null)
  // Monotonic request id: responses that resolve after a newer request started are dropped
  const seqRef = useRef(0)
  const rate_key = `interest-rate:${headId}`
  const frequency_key = `interest-frequency:${headId}`

  function chooseFrequency(next: InterestFrequency) {
    setFrequency(next)
    // The newest completed period of the new cut, same default as on first render.
    const newest = recent_interest_periods(next, today, 1)[0]
    setPreset('1')
    setFrom(newest.from)
    setTo(newest.to)
  }

  // A bank's rate and how often it credits rarely change, so the last ones used for this
  // account are remembered — per browser, since they are conveniences and not ledger data.
  useEffect(() => {
    try {
      const saved_rate = localStorage.getItem(rate_key)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved_rate) setRate(saved_rate)
      const saved_frequency = localStorage.getItem(frequency_key)
      if (saved_frequency === 'monthly') chooseFrequency('monthly')
    } catch {}
    // chooseFrequency only reads `today`; this runs once per account on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate_key, frequency_key])

  function choosePreset(value: string) {
    setPreset(value)
    const period = periods[Number(value)]
    if (value === CUSTOM || !period) return
    setFrom(period.from)
    setTo(period.to)
  }

  async function calculate(e: React.FormEvent) {
    e.preventDefault()
    const rate_pct = Number(rate)
    if (!rate.trim() || !Number.isFinite(rate_pct) || rate_pct <= 0 || rate_pct > 100) {
      setError('Enter the yearly rate as a percentage, for example 2.5')
      return
    }
    if (!from || !to) {
      setError('Pick both dates')
      return
    }
    const seq = ++seqRef.current
    setBusy(true)
    setError(null)
    try {
      const res = await getExpectedInterest(headId, from, to, rate_pct, includeSubheads)
      if (seq !== seqRef.current) return
      if (!res.success) throw new Error(res.message)
      setResult(res.data!)
      try {
        localStorage.setItem(rate_key, rate.trim())
        localStorage.setItem(frequency_key, frequency)
      } catch {}
    } catch (e) {
      if (seq !== seqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      if (seq === seqRef.current) setBusy(false)
    }
  }

  return (
    <Card>
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Interest check</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            What a bank would pay on this account{includeSubheads ? ` and its ${subEntityLabel}` : ''}: every day&apos;s closing balance earns the
            yearly rate ÷ 365, and the total is credited to the nearest rupee. Hold it against the interest you were actually paid.
          </p>
        </div>

        <form onSubmit={calculate} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`interest-rate-${headId}`} className={label_classes}>
              Rate (% a year)
            </label>
            <input
              id={`interest-rate-${headId}`}
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="any"
              placeholder="2.5"
              value={rate}
              onChange={e => setRate(e.target.value)}
              className={`${field_classes} w-28`}
            />
          </div>
          <div>
            <label htmlFor={`interest-frequency-${headId}`} className={label_classes}>
              Credited
            </label>
            <select
              id={`interest-frequency-${headId}`}
              value={frequency}
              onChange={e => chooseFrequency(e.target.value === 'monthly' ? 'monthly' : 'quarterly')}
              className={field_classes}
            >
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label htmlFor={`interest-period-${headId}`} className={label_classes}>
              Period
            </label>
            <select id={`interest-period-${headId}`} value={preset} onChange={e => choosePreset(e.target.value)} className={field_classes}>
              {periods.map((p, i) => (
                <option key={p.from} value={String(i)}>
                  {p.label}
                </option>
              ))}
              <option value={CUSTOM}>Custom dates</option>
            </select>
          </div>
          <div>
            <label htmlFor={`interest-from-${headId}`} className={label_classes}>
              From
            </label>
            <input
              id={`interest-from-${headId}`}
              type="date"
              value={from}
              onChange={e => {
                setFrom(e.target.value)
                setPreset(CUSTOM)
              }}
              className={field_classes}
            />
          </div>
          <div>
            <label htmlFor={`interest-to-${headId}`} className={label_classes}>
              To
            </label>
            <input
              id={`interest-to-${headId}`}
              type="date"
              value={to}
              onChange={e => {
                setTo(e.target.value)
                setPreset(CUSTOM)
              }}
              className={field_classes}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {busy ? 'Calculating…' : 'Calculate'}
          </button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {result && !busy && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {result.projected ? 'Projected' : 'Expected'} interest, {format_day(result.from)} to {format_day(result.to)} at {result.rate_pct}%
              </span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                <MaskedAmount value={result.interest_rounded} />
              </span>
            </div>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 pt-1 border-t border-slate-200 dark:border-slate-600">
              <li className="flex justify-between gap-4">
                <span>Before rounding</span>
                <MaskedAmount value={result.interest} precise />
              </li>
              <li className="flex justify-between gap-4">
                <span>Average daily balance over {result.days} days</span>
                <MaskedAmount value={result.average_balance} />
              </li>
              <li className="flex justify-between gap-4">
                <span>Lowest closing balance</span>
                <MaskedAmount value={result.lowest_balance} />
              </li>
              <li className="flex justify-between gap-4">
                <span>Highest closing balance</span>
                <MaskedAmount value={result.highest_balance} />
              </li>
            </ul>
            {result.negative_days > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {result.negative_days} {result.negative_days === 1 ? 'day' : 'days'} closed below zero and earned nothing.
              </p>
            )}
            {result.projected && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                This period runs past today, so the days still to come use the current balance plus any scheduled transactions.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
