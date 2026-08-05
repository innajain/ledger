'use client'

import { useState } from 'react'
import { Card } from '@/app/_components/Card'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
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

  async function check(chosen: string) {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      const res = await getClosingBalance(headId, chosen)
      if (!res.success) throw new Error(res.message)
      setResult({ date: chosen, balance: res.data! })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <Card>
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Balance on a date</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Closing balance at the end of that day (book value) — handy for checking against a bank statement
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => {
              setDate(e.target.value)
              check(e.target.value)
            }}
            className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
          />
          {busy && <span className="text-sm text-slate-500 dark:text-slate-400">Computing…</span>}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {result && !busy && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 p-4 space-y-2">
            <div className="flex items-baseline justify-between gap-4 flex-wrap">
              <span className="text-sm text-slate-600 dark:text-slate-300">Closing balance on {fmtDate(result.date)}</span>
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
                      {Math.abs(r.qty - r.value) > 0.005 && <span className="text-slate-400 dark:text-slate-500"> · {r.qty} units</span>}
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
