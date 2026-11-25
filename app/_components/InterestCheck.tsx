'use client'

import { useRef, useState } from 'react'
import { Card } from '@/app/_components/Card'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { format_day } from '@/app/_utils/format_date'
import { recent_interest_periods, type InterestFrequency } from '@/app/_utils/interest_periods'
import {
  MAX_SLABS,
  DAY_BASES,
  ROUNDINGS,
  validate_interest_config,
  type DayBasis,
  type InterestConfig,
  type InterestRounding,
  type InterestSettings,
} from '@/app/_utils/interest_config'
import type { ActionResult } from '@/app/_actions/_result'
import type { ExpectedInterest } from '@/app/_core/interest_core'

const CUSTOM = 'custom'
// Band limits are round numbers, so ₹50,000 not ₹50,000.00 — but a typed ₹50,000.5 still shows.
const limit_fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const field_classes = 'px-3 py-2 border border-rule-strong rounded-lg focus:ring-2 focus:ring-blue-500 bg-raised text-ink'
const label_classes = 'block text-sm text-ink-2 mb-1'

const DAY_BASIS_LABEL: Record<DayBasis, string> = {
  fixed_365: '365 days, always',
  calendar_year: 'Days in the calendar year (366 in a leap year)',
  financial_year: 'Days in the Apr–Mar financial year',
}
const ROUNDING_LABEL: Record<InterestRounding, string> = {
  nearest_rupee: 'Nearest rupee',
  round_up_rupee: 'Up to the next rupee',
  paise: 'Keep the paise',
}

type RateMode = 'flat' | 'slabs'
// The rate card as typed. Strings, not numbers, so a half-typed "2." stays put while editing.
type SlabRow = { up_to: string; rate: string }

const EMPTY_SLABS: SlabRow[] = [
  { up_to: '', rate: '' },
  { up_to: '', rate: '' },
]

// The saved rate card as the strings the form edits: one band is a flat rate, more than one
// is a slab table (the last band has no limit, so its box stays empty).
function form_from_saved(saved: InterestSettings | null): { mode: RateMode; rate: string; slabs: SlabRow[] } {
  if (!saved) return { mode: 'flat', rate: '', slabs: EMPTY_SLABS }
  if (saved.slabs.length === 1) return { mode: 'flat', rate: String(saved.slabs[0].rate_pct), slabs: EMPTY_SLABS }
  return {
    mode: 'slabs',
    rate: '',
    slabs: saved.slabs.map(s => ({ up_to: s.up_to === null ? '' : String(s.up_to), rate: String(s.rate_pct) })),
  }
}

// What the open-ended last band starts above: the previous band's limit once it is typed.
function last_band_floor(rows: SlabRow[], index: number): string {
  const previous = index > 0 ? rows[index - 1].up_to.trim() : ''
  const amount = previous === '' ? NaN : Number(previous)
  return Number.isFinite(amount) ? limit_fmt.format(amount) : 'the limit above'
}

function band_label(up_to: number | null, previous_top: number | null): string {
  if (up_to === null) return previous_top === null ? 'Whole balance' : `Above ${limit_fmt.format(previous_top)}`
  if (previous_top === null) return `Up to ${limit_fmt.format(up_to)}`
  return `${limit_fmt.format(previous_top)} – ${limit_fmt.format(up_to)}`
}

export function InterestCheck({
  headId,
  today,
  getExpectedInterest,
  saved,
  saveSettings,
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
    config: InterestConfig,
    include_subheads?: boolean,
  ) => Promise<ActionResult<ExpectedInterest>>
  /** The rate card saved on this account (null when none is) — the form starts from it. */
  saved: InterestSettings | null
  saveSettings: (head_id: string, settings: InterestSettings | null) => Promise<ActionResult<InterestSettings | null>>
  /** Follows the head page's scope toggle; callers key the component on it so a flip remounts. */
  includeSubheads?: boolean
  subEntityLabel?: string
}) {
  // Period in progress first, then the completed ones a bank has already paid for. The
  // newest completed one is the default: it is the one with a credit to check against.
  // Everything else starts from the card saved on the account, so a saved account needs only
  // dates — the server renders it the same way, so there is no flash of an empty form.
  const initial = form_from_saved(saved)
  const [frequency, setFrequency] = useState<InterestFrequency>(saved?.frequency ?? 'quarterly')
  const periods = recent_interest_periods(frequency, today, frequency === 'monthly' ? 12 : 4, true)
  const [preset, setPreset] = useState('1')
  const [from, setFrom] = useState(periods[1].from)
  const [to, setTo] = useState(periods[1].to)
  const [mode, setMode] = useState<RateMode>(initial.mode)
  const [rate, setRate] = useState(initial.rate)
  const [slabs, setSlabs] = useState<SlabRow[]>(initial.slabs)
  const [day_basis, setDayBasis] = useState<DayBasis>(saved?.day_basis ?? 'fixed_365')
  const [rounding, setRounding] = useState<InterestRounding>(saved?.rounding ?? 'nearest_rupee')
  const [round_each_day, setRoundEachDay] = useState(saved?.round_each_day ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExpectedInterest | null>(null)
  // Whether the account has a card saved, and a one-line note after saving or clearing it.
  const [has_saved, setHasSaved] = useState(saved !== null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // Monotonic request id: responses that resolve after a newer request started are dropped
  const seqRef = useRef(0)

  function chooseFrequency(next: InterestFrequency) {
    setFrequency(next)
    // The newest completed period of the new cut, same default as on first render.
    const newest = recent_interest_periods(next, today, 1)[0]
    setPreset('1')
    setFrom(newest.from)
    setTo(newest.to)
  }

  function choosePreset(value: string) {
    setPreset(value)
    const period = periods[Number(value)]
    if (value === CUSTOM || !period) return
    setFrom(period.from)
    setTo(period.to)
  }

  function setRow(index: number, patch: Partial<SlabRow>) {
    setSlabs(rows => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  // A new band goes in just before the open-ended last one, which always stays last.
  function addBand() {
    setSlabs(rows => (rows.length >= MAX_SLABS ? rows : [...rows.slice(0, -1), { up_to: '', rate: '' }, rows[rows.length - 1]]))
  }
  function removeBand(index: number) {
    setSlabs(rows => (rows.length <= 2 ? rows : rows.filter((_, i) => i !== index)))
  }

  // The rows are typed text; turn them into numbers and let the shared validator say what is
  // wrong, so the message here is the same one the server would give. Null (with the error
  // set) when the card isn't usable yet.
  function build_config(): InterestConfig | null {
    const to_number = (s: string) => (s.trim() === '' ? NaN : Number(s))
    const bands =
      mode === 'flat'
        ? [{ up_to: null, rate_pct: to_number(rate) }]
        : slabs.map((r, i) => ({ up_to: i === slabs.length - 1 ? null : to_number(r.up_to), rate_pct: to_number(r.rate) }))
    try {
      return validate_interest_config({ slabs: bands, day_basis, rounding, round_each_day })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Check the rate'
      setError(/between 0 and 100/.test(message) && mode === 'flat' ? 'Enter the yearly rate as a percentage, for example 2.5' : message)
      return null
    }
  }

  async function calculate(e: React.FormEvent) {
    e.preventDefault()
    setNote(null)
    const config = build_config()
    if (!config) return
    if (!from || !to) {
      setError('Pick both dates')
      return
    }
    const seq = ++seqRef.current
    setBusy(true)
    setError(null)
    try {
      const res = await getExpectedInterest(headId, from, to, config, includeSubheads)
      if (seq !== seqRef.current) return
      if (!res.success) throw new Error(res.message)
      setResult(res.data!)
    } catch (e) {
      if (seq !== seqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      if (seq === seqRef.current) setBusy(false)
    }
  }

  // Saves the card as it stands on the account, or clears what is saved. It lives on the
  // account, so it follows you to every device and is what the MCP tool uses by default.
  async function persist(clear: boolean) {
    setNote(null)
    let settings: InterestSettings | null = null
    if (!clear) {
      const config = build_config()
      if (!config) return
      settings = { ...config, frequency }
    }
    setSaving(true)
    setError(null)
    try {
      const res = await saveSettings(headId, settings)
      if (!res.success) throw new Error(res.message)
      setHasSaved(!clear)
      setNote(
        clear ? 'Cleared — this account has no saved rate card now.' : 'Saved on this account. It is used on every device and by the assistant.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const flat_rate = result && result.config.slabs.length === 1 ? result.config.slabs[0].rate_pct : null

  return (
    <Card>
      <div className="p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Interest check</h2>
          <p className="text-sm text-ink-3 mt-1">
            What a bank would pay on this account{includeSubheads ? ` and its ${subEntityLabel}` : ''}: every day&apos;s closing balance earns the
            yearly rate ÷ days in the year, and the total is credited the way the bank rounds it. Hold it against the interest you were actually paid.
          </p>
        </div>

        <form onSubmit={calculate} className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`interest-mode-${headId}`} className={label_classes}>
                Rate card
              </label>
              <select
                id={`interest-mode-${headId}`}
                value={mode}
                onChange={e => setMode(e.target.value === 'slabs' ? 'slabs' : 'flat')}
                className={field_classes}
              >
                <option value="flat">One flat rate</option>
                <option value="slabs">Slabs (by balance)</option>
              </select>
            </div>
            {mode === 'flat' && (
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
            )}
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
          </div>

          {mode === 'slabs' && (
            <fieldset className="space-y-2">
              <legend className="text-sm text-ink-2 mb-1">Each band&apos;s rate applies only to the part of the balance inside it</legend>
              {slabs.map((row, i) => {
                const last = i === slabs.length - 1
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="w-14 text-sm text-ink-3">{last ? 'Above' : 'Up to'}</span>
                    {last ? (
                      <span className={`${field_classes} w-40 opacity-70`}>{last_band_floor(slabs, i)}</span>
                    ) : (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        aria-label={`Band ${i + 1} upper limit in rupees`}
                        placeholder="₹ upper limit"
                        value={row.up_to}
                        onChange={e => setRow(i, { up_to: e.target.value })}
                        className={`${field_classes} w-40`}
                      />
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="any"
                      aria-label={`Band ${i + 1} rate, percent a year`}
                      placeholder="% a year"
                      value={row.rate}
                      onChange={e => setRow(i, { rate: e.target.value })}
                      className={`${field_classes} w-28`}
                    />
                    {!last && slabs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeBand(i)}
                        aria-label={`Remove band ${i + 1}`}
                        className="px-2 py-1 text-sm text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )
              })}
              {slabs.length < MAX_SLABS && (
                <button type="button" onClick={addBand} className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  + Add a band
                </button>
              )}
            </fieldset>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">Rounding and day count</summary>
            <div className="flex flex-wrap items-end gap-3 pt-3">
              <div>
                <label htmlFor={`interest-basis-${headId}`} className={label_classes}>
                  Days in a year
                </label>
                <select
                  id={`interest-basis-${headId}`}
                  value={day_basis}
                  onChange={e => setDayBasis(e.target.value as DayBasis)}
                  className={field_classes}
                >
                  {DAY_BASES.map(b => (
                    <option key={b} value={b}>
                      {DAY_BASIS_LABEL[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`interest-rounding-${headId}`} className={label_classes}>
                  Credit is rounded
                </label>
                <select
                  id={`interest-rounding-${headId}`}
                  value={rounding}
                  onChange={e => setRounding(e.target.value as InterestRounding)}
                  className={field_classes}
                >
                  {ROUNDINGS.map(r => (
                    <option key={r} value={r}>
                      {ROUNDING_LABEL[r]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 py-2 text-ink-2">
                <input type="checkbox" checked={round_each_day} onChange={e => setRoundEachDay(e.target.checked)} />
                Round each day to the paisa first (a bank that credits daily)
              </label>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {busy ? 'Calculating…' : 'Calculate'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => persist(false)}
              className="px-4 py-2 rounded-lg border border-rule-strong text-ink-2 hover:bg-sunken disabled:opacity-60 text-sm font-medium transition-colors"
            >
              {saving ? 'Saving…' : has_saved ? 'Update saved rate card' : 'Save rate card on this account'}
            </button>
            {has_saved && (
              <button
                type="button"
                disabled={saving}
                onClick={() => persist(true)}
                className="text-sm text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:opacity-60"
              >
                Clear saved
              </button>
            )}
          </div>
          {note && (
            <p role="status" className="text-sm text-ink-3">
              {note}
            </p>
          )}
        </form>

        {error && (
          <p role="alert" className="text-sm text-neg">
            {error}
          </p>
        )}

        {result && !busy && (
          <div className="rounded-lg bg-sunken border border-rule p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="text-sm text-ink-2">
                {result.projected ? 'Projected' : 'Expected'} interest, {format_day(result.from)} to {format_day(result.to)}
                {flat_rate !== null ? ` at ${flat_rate}%` : ` on ${result.config.slabs.length} bands`}
              </span>
              <span className="text-xl font-bold text-ink">
                <MaskedAmount value={result.interest_rounded} precise={result.config.rounding === 'paise'} />
              </span>
            </div>
            <ul className="text-sm text-ink-2 space-y-1 pt-1 border-t border-rule">
              <li className="flex justify-between gap-4">
                <span>{result.config.round_each_day ? 'Sum of each day, to the paisa' : 'Before rounding'}</span>
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
            {result.by_slab.length > 1 && (
              <ul className="text-sm text-ink-2 space-y-1 pt-1 border-t border-rule">
                {result.by_slab.map((s, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span>
                      {band_label(s.up_to, i === 0 ? null : result.by_slab[i - 1].up_to)} · {s.rate_pct}%
                    </span>
                    <MaskedAmount value={s.interest} precise />
                  </li>
                ))}
              </ul>
            )}
            {result.negative_days > 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {result.negative_days} {result.negative_days === 1 ? 'day' : 'days'} closed below zero and earned nothing.
              </p>
            )}
            {result.projected && (
              <p className="text-sm text-ink-3">
                This period runs past today, so the days still to come use the current balance plus any scheduled transactions.
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
