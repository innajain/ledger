'use client'

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/app/_components/Card'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { format_day } from '@/app/_utils/format_date'
import type { ActionResult } from '@/app/_actions/_result'
import type { ClosingBalance } from '@/app/heads/[type]/[id]/closing_balance'

export function AsOfBalance({
  headId,
  getClosingBalance,
}: {
  headId: string
  getClosingBalance: (head_id: string, date: string) => Promise<ActionResult<ClosingBalance>>
}) {
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ date: string; balance: ClosingBalance } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic request id: responses that resolve after a newer request started are dropped
  const seqRef = useRef(0)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function check(chosen: string) {
    const seq = ++seqRef.current
    setBusy(true)
    setError(null)
    try {
      const res = await getClosingBalance(headId, chosen)
      if (seq !== seqRef.current) return
      if (!res.success) throw new Error(res.message)
      setResult({ date: chosen, balance: res.data! })
    } catch (e) {
      if (seq !== seqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      if (seq === seqRef.current) setBusy(false)
    }
  }

  // Debounced: keyboard date entry commits several intermediate valid dates, and each
  // check is a full line-item scan server-side — only the settled date should query
  function onDateChange(chosen: string) {
    setDate(chosen)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!chosen) {
      seqRef.current++
      setBusy(false)
      return
    }
    setBusy(true)
    timerRef.current = setTimeout(() => check(chosen), 400)
  }

  return (
    <Card>
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Balance on a date</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Closing balance at the end of that day (book value) — handy for checking against a bank statement. Pick a future date to project the
            balance forward using scheduled transactions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            aria-label="Balance on date"
            value={date}
            onChange={e => onDateChange(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          />
          {busy && (
            <span role="status" aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">
              Computing…
            </span>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {result && !busy && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="text-sm text-slate-600 dark:text-slate-300">Closing balance on {format_day(result.date)}</span>
              <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                <MaskedAmount value={result.balance.total_value} />
              </span>
            </div>
            {result.balance.rows.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No activity on or before this date.</p>}
            {(result.balance.rows.length > 1 || result.balance.rows.some(r => Math.abs(r.qty - r.value) > 0.005)) && (
              <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 pt-1 border-t border-slate-200 dark:border-slate-600">
                {result.balance.rows.map(r => (
                  <li key={r.asset_name} className="flex justify-between gap-4">
                    <span>
                      {r.asset_name}
                      {Math.abs(r.qty - r.value) > 0.005 && <span className="text-slate-500 dark:text-slate-400"> · {r.qty} units</span>}
                    </span>
                    <span>
                      <MaskedAmount value={r.value} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
