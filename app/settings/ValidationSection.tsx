'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SectionHeading } from './SectionHeading'
import { validate_my_txns, type MyTxnValidation } from './validate_my_txns'

export function ValidationSection() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MyTxnValidation | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await validate_my_txns()
      if (!res.success) throw new Error(res.message)
      setResult(res.data!)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <SectionHeading id="validation">Validation</SectionHeading>
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-6 transition-colors space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Check my ledger</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Re-runs the balancing invariant over every transaction in your ledger and lists any that fail — useful after bulk edits or imports.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="px-5 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
        >
          {busy ? 'Checking…' : 'Run check'}
        </button>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {result && !busy && (
          <div>
            {result.invalid.length === 0 ? (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
                All {result.checked} transaction{result.checked === 1 ? '' : 's'} balance correctly ✓
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                  {result.invalid.length} of {result.checked} transactions fail the balancing invariant:
                </div>
                <ul className="space-y-2">
                  {result.invalid.map(t => (
                    <li key={t.id}>
                      <Link
                        href={`/transactions/${t.id}`}
                        className="block px-4 py-3 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                      >
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {t.description || 'No description'}{' '}
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            · {new Date(t.datetime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </span>
                        <span className="block text-xs text-red-700 dark:text-red-300 mt-1">{t.message}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
