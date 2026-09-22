'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/app/_components/Toast'
import { Button, buttonClasses } from '@/app/_components/Button'
import { flush_redis } from './flush'
import { validate_all_txns, type InvalidTxn } from './validate_all_txns'
import { SectionHeading } from './SectionHeading'

export function AdminSection() {
  const { showToast } = useToast()
  const [flushing, setFlushing] = useState(false)
  const [validating, setValidating] = useState(false)
  const [invalid, setInvalid] = useState<InvalidTxn[] | null>(null)

  async function handleFlushRedis() {
    if (!confirm('Flush the Redis cache? Cached prices and balances will be recomputed on next use.')) return
    setFlushing(true)
    try {
      const res = await flush_redis()
      if (res.success) showToast(res.message ?? 'Redis cache flushed', 'success')
      else showToast(res.message ?? "Couldn't flush the cache", 'error')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setFlushing(false)
    }
  }

  async function handleValidate() {
    setValidating(true)
    try {
      const res = await validate_all_txns()
      setInvalid(res)
      if (res.length === 0) showToast('All transactions are valid', 'success')
      else showToast(`Invalid transactions found (${res.length})`, 'warning')
    } catch (err: unknown) {
      setInvalid(null)
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setValidating(false)
    }
  }

  return (
    <section>
      <SectionHeading id="admin">Admin</SectionHeading>
      <div className="space-y-6">
        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Flush Redis cache</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Clears every cached price, balance, and chart series. Next page render will rebuild from source.
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={handleFlushRedis} disabled={flushing}>
              {flushing ? 'Flushing…' : 'Flush cache'}
            </Button>
          </div>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Validate transactions</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Run the integrity checker against every transaction, across every user, and list any that do not balance.
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={handleValidate} disabled={validating}>
              {validating ? 'Validating…' : 'Validate all'}
            </Button>
          </div>

          {invalid && !validating && (
            <>
              {invalid.length === 0 ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200"
                >
                  Every transaction balances correctly
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-200"
                  >
                    {invalid.length} transaction{invalid.length === 1 ? ' does' : 's do'} not balance:
                  </div>
                  <ul className="space-y-2">
                    {invalid.map(t => (
                      <li key={t.id}>
                        <Link
                          href={`/transactions/${t.id}`}
                          className="block px-4 py-3 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                        >
                          <span className="text-sm font-mono text-slate-900 dark:text-slate-100">{t.id}</span>
                          <span className="block text-xs text-red-700 dark:text-red-300 mt-1">{t.message}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-4 sm:p-6 transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Complete DB dump</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Download the entire database — every table, every user — as a restorable SQL file. Sensitive: includes all users&apos; data and
                password hashes.
              </p>
            </div>
            <a href="/api/admin/dump" className={buttonClasses('secondary', 'md', 'shrink-0')}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
