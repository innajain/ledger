'use client'

import { useState } from 'react'
import { useToast } from '@/app/_components/Toast'
import { Button, buttonClasses } from '@/app/_components/Button'
import { flush_redis } from './flush'
import { validate_all_txns } from './validate_all_txns'
import { SectionHeading } from './SectionHeading'

export function AdminSection() {
  const { showToast } = useToast()
  const [flushing, setFlushing] = useState(false)
  const [validating, setValidating] = useState(false)

  async function handleFlushRedis() {
    if (!confirm('Flush Redis cache? This clears all cached prices.')) return
    setFlushing(true)
    try {
      const res = await flush_redis()
      if (res.success) showToast(res.message ?? 'Redis cache flushed', 'success')
      else showToast(res.message ?? 'Flush failed', 'error')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setFlushing(false)
    }
  }

  async function handleValidate() {
    if (!confirm('Validate all transactions? This will check every txn.')) return
    setValidating(true)
    try {
      const res = await validate_all_txns()
      if (!res || res.length === 0) {
        showToast('All transactions are valid', 'success')
      } else {
        const details = res.map(r => `id: ${r.id} — ${r.message}`).join('\n')
        console.error(`Invalid transactions found (${res.length}):\n\n${details}`)
        showToast(`Invalid transactions found (${res.length}). See console for details.`, 'warning')
      }
    } catch (err: unknown) {
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
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Flush Redis Cache</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Clears every cached price, balance, and chart series. Next page render will rebuild from source.
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={handleFlushRedis} disabled={flushing}>
              {flushing ? 'Flushing...' : 'Flush cache'}
            </Button>
          </div>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Validate Transactions</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Run the integrity checker against every transaction. Any failures are logged to the browser console.
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={handleValidate} disabled={validating}>
              {validating ? 'Validating...' : 'Validate all'}
            </Button>
          </div>
        </div>

        {}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-6 transition-colors">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Complete DB Dump</h3>
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
