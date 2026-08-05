'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { parse_statement, type ParsedStatementRow } from '@/app/_utils/statement_parser'
import { run_reconcile, create_missing_transactions, type ReconcileView, type StatementRow } from './reconcile_actions'
import type { LineItemDefaults } from '@/app/_actions/preferences'

type HeadOpt = { id: string; name: string }

const inputCls =
  'w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'

function fmtDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Amount({ value }: { value: number }) {
  return (
    <span className={`font-semibold ${value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      <MaskedAmount value={value} />
    </span>
  )
}

export default function ClientPage({
  accounts,
  allocations,
  incomeExpenses,
  defaults,
}: {
  accounts: HeadOpt[]
  allocations: HeadOpt[]
  incomeExpenses: HeadOpt[]
  defaults: LineItemDefaults
}) {
  const [accountId, setAccountId] = useState('')
  const [rawText, setRawText] = useState('')
  const [parsed, setParsed] = useState<{ rows: ParsedStatementRow[]; errors: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ReconcileView | null>(null)

  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [allocationId, setAllocationId] = useState(defaults.default_allocation_id ?? '')
  const [incomeExpenseId, setIncomeExpenseId] = useState(defaults.default_income_expense_id ?? '')
  const [creating, setCreating] = useState(false)
  const [createNote, setCreateNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setRawText(String(reader.result ?? ''))
      setParsed(null)
      setView(null)
    }
    reader.readAsText(file)
  }

  async function runWithRows(rows: StatementRow[]) {
    const res = await run_reconcile(accountId, rows)
    if (!res.success) throw new Error(res.message)
    setView(res.data!)
    setSelected(new Set(res.data!.missing_in_ledger.map(r => r.index)))
  }

  async function handleReconcile() {
    setError(null)
    setCreateNote(null)
    setView(null)
    const outcome = parse_statement(rawText)
    setParsed(outcome)
    if (outcome.rows.length === 0) return
    if (!accountId) {
      setError('Pick the account this statement belongs to')
      return
    }
    setBusy(true)
    try {
      await runWithRows(outcome.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateMissing() {
    if (!view || !parsed) return
    const rows = view.missing_in_ledger.filter(r => selected.has(r.index))
    if (rows.length === 0) return
    if (!allocationId || !incomeExpenseId) {
      setError('Pick the allocation and income/expense heads to book these under')
      return
    }
    setError(null)
    setCreating(true)
    try {
      const res = await create_missing_transactions(accountId, allocationId, incomeExpenseId, rows)
      if (!res.success) throw new Error(res.message)
      setCreateNote(
        `Added ${res.data!.created} transaction${res.data!.created === 1 ? '' : 's'}${res.data!.replayed > 0 ? ` (${res.data!.replayed} already existed)` : ''} — re-checked below.`,
      )
      await runWithRows(parsed.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  function toggle(index: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const selectedCount = view ? view.missing_in_ledger.filter(r => selected.has(r.index)).length : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Reconcile a statement</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">
          Paste rows from a bank statement, match them against the ledger, and add whatever&apos;s missing — safely re-runnable
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-4 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Account</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={inputCls}>
              <option value="">Select the statement&apos;s account…</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium"
            >
              Upload CSV…
            </button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Statement rows</label>
          <textarea
            value={rawText}
            onChange={e => {
              setRawText(e.target.value)
              setParsed(null)
            }}
            rows={8}
            placeholder={
              'Paste CSV or tab-separated rows — with a header (Date, Narration, UTR, Withdrawal, Deposit …)\nor bare columns: date, amount, ref, description\n\n01-08-2026,-6800,UPI-621663575718,Rent\n03-08-2026,85000,NEFT-123,Salary'
            }
            className={`${inputCls} font-mono text-xs leading-relaxed`}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Amounts are signed: negative = money out. Debit/credit columns and ₹/Cr/Dr markers are understood.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReconcile}
            disabled={busy || rawText.trim() === ''}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
          >
            {busy ? 'Reconciling…' : 'Reconcile'}
          </button>
          {parsed && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} parsed
              {parsed.errors.length > 0 && `, ${parsed.errors.length} skipped`}
            </span>
          )}
        </div>

        {parsed && parsed.errors.length > 0 && (
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
            {parsed.errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}
          </ul>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {view && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['Matched', view.counts.matched, 'text-green-600 dark:text-green-400'],
                ['Missing in ledger', view.counts.missing_in_ledger, 'text-red-600 dark:text-red-400'],
                ['Not on statement', view.counts.missing_in_bank, 'text-slate-600 dark:text-slate-300'],
                ['Amount mismatch', view.counts.amount_mismatch, 'text-amber-600 dark:text-amber-400'],
              ] as const
            ).map(([label, count, cls]) => (
              <div key={label} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 transition-colors">
                <p className={`text-2xl font-bold ${cls}`}>{count}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-baseline justify-between gap-2 transition-colors">
            <span className="text-sm text-slate-600 dark:text-slate-300">Ledger closing balance for {view.account_name} at the window end</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              <MaskedAmount value={view.ledger_closing_balance} />
            </span>
          </div>

          {createNote && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
              {createNote}
            </div>
          )}

          {view.missing_in_ledger.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-red-200 dark:border-red-900 overflow-hidden transition-colors">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-red-50 dark:bg-red-900/20">
                <h2 className="font-semibold text-red-800 dark:text-red-200">Missing in ledger</h2>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
                  Statement rows with no matching transaction — tick the ones to add, pick where to book them, and create them in one go
                </p>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {view.missing_in_ledger.map(r => (
                  <li key={r.index} className="px-6 py-3 flex items-center gap-4">
                    <input
                      type="checkbox"
                      checked={selected.has(r.index)}
                      onChange={() => toggle(r.index)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.desc || r.ref || 'No description'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {fmtDate(r.date)}
                        {r.ref && <span className="font-mono"> · {r.ref}</span>}
                      </p>
                    </div>
                    <Amount value={r.amount} />
                  </li>
                ))}
              </ul>
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-40">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Allocation</label>
                  <select value={allocationId} onChange={e => setAllocationId(e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {allocations.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-40">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Income / Expense</label>
                  <select value={incomeExpenseId} onChange={e => setIncomeExpenseId(e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {incomeExpenses.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreateMissing}
                  disabled={creating || selectedCount === 0}
                  className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {creating ? 'Adding…' : `Add ${selectedCount} to ledger`}
                </button>
              </div>
              <p className="px-6 pb-4 text-xs text-slate-500 dark:text-slate-400">
                Each entry is created with its bank reference and an idempotency key, so re-running this import can never double-post. Re-categorize
                individual entries later if needed.
              </p>
            </div>
          )}

          {view.amount_mismatch.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-amber-200 dark:border-amber-900 overflow-hidden transition-colors">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
                <h2 className="font-semibold text-amber-800 dark:text-amber-200">Amount mismatch</h2>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">Same reference, different amount — check these by hand</p>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {view.amount_mismatch.map(r => (
                  <li key={r.index} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.desc || r.ref}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {fmtDate(r.date)}
                        {r.ref && <span className="font-mono"> · {r.ref}</span>}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p>
                        Statement: <Amount value={r.amount} />
                      </p>
                      <p>
                        Ledger: <Amount value={r.ledger_delta} />
                      </p>
                    </div>
                    <Link
                      href={`/transactions/${r.transaction_id}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                    >
                      View →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.missing_in_bank.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <h2 className="font-semibold text-slate-800 dark:text-slate-200">In ledger, not on statement</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Ledger entries in this window that no statement row matched — possible duplicates or wrong dates
                </p>
              </div>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {view.missing_in_bank.map((e, i) => (
                  <li key={`${e.transaction_id}-${i}`} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{e.description || 'No description'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(e.datetime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {e.external_ref && <span className="font-mono"> · {e.external_ref}</span>}
                      </p>
                    </div>
                    <Amount value={e.delta} />
                    <Link
                      href={`/transactions/${e.transaction_id}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                    >
                      View →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {view.matched.length > 0 && (
            <details className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
              <summary className="px-6 py-4 cursor-pointer font-semibold text-green-800 dark:text-green-300 bg-green-50 dark:bg-green-900/20">
                Matched ({view.matched.length})
              </summary>
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {view.matched.map(r => (
                  <li key={r.index} className="px-6 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.desc || r.ref || 'Row'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {fmtDate(r.date)}
                        {r.ref && <span className="font-mono"> · {r.ref}</span>}
                        <span> · matched by {r.matched_by === 'ref' ? 'reference' : 'amount + date'}</span>
                      </p>
                    </div>
                    <Amount value={r.amount} />
                    <Link
                      href={`/transactions/${r.transaction_id}`}
                      className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                    >
                      View →
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
