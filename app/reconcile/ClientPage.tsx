'use client'

import { memo, useCallback, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/app/_components/Button'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { format_day } from '@/app/_utils/format_date'
import type { ParsedStatementRow } from '@/app/_utils/statement_parser'
import { run_reconcile, create_missing_transactions, set_reconciliation_lock, type ReconcileView, type StatementRow } from './reconcile_actions'
import type { LineItemDefaults } from '@/app/_actions/preferences'

type HeadOpt = { id: string; name: string }
type AccountOpt = HeadOpt & { lock_date: string | null } // yyyy-MM-dd

const inputCls =
  'w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'

function Amount({ value }: { value: number }) {
  return (
    <span className={`font-semibold ${value > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
      <MaskedAmount value={value} keep_sign />
    </span>
  )
}

// The result sections are memoized so textarea keystrokes and checkbox toggles in the parent
// don't re-render hundreds of rows (each calling format_day). `view` is referentially stable
// across keystrokes; only MissingInLedgerSection depends on the selection state.

const MissingInLedgerSection = memo(function MissingInLedgerSection({
  view,
  selected,
  toggle,
  allocations,
  incomeExpenses,
  allocationId,
  setAllocationId,
  incomeExpenseId,
  setIncomeExpenseId,
  creating,
  selectedCount,
  onCreateMissing,
}: {
  view: ReconcileView
  selected: Set<number>
  toggle: (index: number) => void
  allocations: HeadOpt[]
  incomeExpenses: HeadOpt[]
  allocationId: string
  setAllocationId: (id: string) => void
  incomeExpenseId: string
  setIncomeExpenseId: (id: string) => void
  creating: boolean
  selectedCount: number
  onCreateMissing: () => void
}) {
  const uid = useId()
  return (
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
              aria-label={`Add ${r.desc || r.ref || 'row'} (${format_day(r.date)}) to ledger`}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{r.desc || r.ref || 'No description'}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {format_day(r.date)}
                {r.ref && <span className="font-mono"> · {r.ref}</span>}
              </p>
            </div>
            <Amount value={r.amount} />
          </li>
        ))}
      </ul>
      <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-40">
          <label htmlFor={`${uid}-allocation`} className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Allocation
          </label>
          <select id={`${uid}-allocation`} value={allocationId} onChange={e => setAllocationId(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {allocations.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-40">
          <label htmlFor={`${uid}-income-expense`} className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Income / Expense
          </label>
          <select id={`${uid}-income-expense`} value={incomeExpenseId} onChange={e => setIncomeExpenseId(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {incomeExpenses.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="primary" onClick={onCreateMissing} disabled={creating || selectedCount === 0}>
          {creating ? 'Adding…' : `Add ${selectedCount} to ledger`}
        </Button>
      </div>
      <p className="px-6 pb-4 text-xs text-slate-500 dark:text-slate-400">
        Re-running this import never adds the same row twice — each entry is tagged with its bank reference. Re-categorize individual entries later if
        needed.
      </p>
    </div>
  )
})

const AmountMismatchSection = memo(function AmountMismatchSection({ view }: { view: ReconcileView }) {
  return (
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
                {format_day(r.date)}
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
  )
})

const MissingInBankSection = memo(function MissingInBankSection({ view }: { view: ReconcileView }) {
  return (
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
                {format_day(e.datetime)}
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
  )
})

const MatchedSection = memo(function MatchedSection({ view }: { view: ReconcileView }) {
  return (
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
                {format_day(r.date)}
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
  )
})

export default function ClientPage({
  accounts,
  allocations,
  incomeExpenses,
  defaults,
  initialAccountId = '',
}: {
  accounts: AccountOpt[]
  allocations: HeadOpt[]
  incomeExpenses: HeadOpt[]
  defaults: LineItemDefaults
  // preselected via ?account=<id>; the server has already checked it names one of `accounts`
  initialAccountId?: string
}) {
  const uid = useId()
  const [accountId, setAccountId] = useState(initialAccountId)
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
  const [locking, setLocking] = useState(false)
  // account_id -> yyyy-MM-dd, set after advancing a lock here (fresher than the server-rendered props)
  const [lockOverrides, setLockOverrides] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const lockedThrough = accountId ? (lockOverrides[accountId] ?? accounts.find(a => a.id === accountId)?.lock_date ?? null) : null

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

  const runWithRows = useCallback(
    async (rows: StatementRow[]) => {
      const res = await run_reconcile(accountId, rows)
      if (!res.success) throw new Error(res.message)
      setView(res.data!)
      setSelected(new Set(res.data!.missing_in_ledger.map(r => r.index)))
    },
    [accountId],
  )

  async function handleReconcile() {
    setError(null)
    setCreateNote(null)
    setView(null)
    // Parser loads on first use — it's only needed once a statement is actually pasted.
    const { parse_statement } = await import('@/app/_utils/statement_parser')
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

  const handleCreateMissing = useCallback(async () => {
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
  }, [view, parsed, selected, allocationId, incomeExpenseId, accountId, runWithRows])

  const toggle = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const selectedCount = view ? view.missing_in_ledger.filter(r => selected.has(r.index)).length : 0

  const windowEnd = parsed && parsed.rows.length > 0 ? parsed.rows.reduce((max, r) => (r.date > max ? r.date : max), parsed.rows[0].date) : null
  // only the account this view was actually run for can be locked from it
  const viewMatchesAccount = view !== null && view.account_id === accountId
  // every statement row parsed, every one matched, and no unexplained ledger
  // flow in the window — anything less means something in here is still unverified
  const cleanMatch =
    viewMatchesAccount &&
    parsed !== null &&
    parsed.errors.length === 0 &&
    view.counts.missing_in_ledger === 0 &&
    view.counts.amount_mismatch === 0 &&
    view.counts.missing_in_bank === 0
  const canAdvanceLock = cleanMatch && windowEnd !== null && (lockedThrough === null || windowEnd > lockedThrough)

  async function handleAdvanceLock() {
    if (!canAdvanceLock || !windowEnd || !view) return
    setError(null)
    setLocking(true)
    try {
      const res = await set_reconciliation_lock(view.account_id, windowEnd)
      if (!res.success) throw new Error(res.message)
      setLockOverrides(prev => ({ ...prev, [view.account_id]: windowEnd }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLocking(false)
    }
  }

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
            <label htmlFor={`${uid}-account`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Account
            </label>
            <select
              id={`${uid}-account`}
              value={accountId}
              onChange={e => {
                // results belong to the account they were run for — drop them
                setAccountId(e.target.value)
                setView(null)
                setCreateNote(null)
              }}
              className={inputCls}
            >
              <option value="">Select the statement&apos;s account…</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {lockedThrough && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                Reconciled &amp; locked through {format_day(lockedThrough)} — entries on or before that day can&apos;t be changed
              </p>
            )}
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Upload CSV…
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        </div>

        <div>
          <label htmlFor={`${uid}-rows`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Statement rows
          </label>
          <textarea
            id={`${uid}-rows`}
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
          <Button variant="primary" onClick={handleReconcile} disabled={busy || rawText.trim() === ''}>
            {busy ? 'Reconciling…' : 'Reconcile'}
          </Button>
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

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
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

          {windowEnd && viewMatchesAccount && (
            <div
              className={`rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                cleanMatch
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <div>
                <p className={`text-sm font-medium ${cleanMatch ? 'text-green-800 dark:text-green-200' : 'text-slate-700 dark:text-slate-300'}`}>
                  {cleanMatch
                    ? `Clean match — if the closing balance above equals the statement's, ${view.account_name} is verified through ${format_day(windowEnd)}`
                    : `Every row must be accounted for before locking — ${[
                        view.counts.missing_in_ledger > 0 && `${view.counts.missing_in_ledger} missing in ledger`,
                        view.counts.amount_mismatch > 0 && `${view.counts.amount_mismatch} amount mismatch`,
                        view.counts.missing_in_bank > 0 && `${view.counts.missing_in_bank} not on statement`,
                        parsed &&
                          parsed.errors.length > 0 &&
                          `${parsed.errors.length} row${parsed.errors.length === 1 ? '' : 's'} skipped by the parser`,
                      ]
                        .filter(Boolean)
                        .join(', ')} still open`}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {lockedThrough ? `Currently locked through ${format_day(lockedThrough)}` : 'No reconciliation lock set yet'} — locking makes entries
                  on or before the day immutable
                </p>
              </div>
              {canAdvanceLock && (
                <Button variant="primary" onClick={handleAdvanceLock} disabled={locking}>
                  {locking ? 'Locking…' : `Lock through ${format_day(windowEnd)}`}
                </Button>
              )}
            </div>
          )}

          {createNote && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200"
            >
              {createNote}
            </div>
          )}

          {view.missing_in_ledger.length > 0 && (
            <MissingInLedgerSection
              view={view}
              selected={selected}
              toggle={toggle}
              allocations={allocations}
              incomeExpenses={incomeExpenses}
              allocationId={allocationId}
              setAllocationId={setAllocationId}
              incomeExpenseId={incomeExpenseId}
              setIncomeExpenseId={setIncomeExpenseId}
              creating={creating}
              selectedCount={selectedCount}
              onCreateMissing={handleCreateMissing}
            />
          )}

          {view.amount_mismatch.length > 0 && <AmountMismatchSection view={view} />}

          {view.missing_in_bank.length > 0 && <MissingInBankSection view={view} />}

          {view.matched.length > 0 && <MatchedSection view={view} />}
        </>
      )}
    </div>
  )
}
