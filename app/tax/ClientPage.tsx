'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/app/_components/Card'
import { InfoCard } from '@/app/_components/ViewPageComponents'
import { MaskedAmount } from '@/app/_components/MaskedAmount'
import { ErrorAlert } from '@/app/_components/FormComponents'
import { SectionHeading } from '@/app/settings/SectionHeading'
import { plain_currency_fmt } from '@/app/_utils/currency_formatter'
import { set_tax_treatment } from './set_tax_treatment'
import type { SerializedTaxCoreResult } from '@/app/_core/tax_core'
import type { tax_treatment } from '@/generated/prisma/enums'

const TREATMENT_OPTIONS: { value: tax_treatment; label: string }[] = [
  { value: 'salary_17_1', label: 'Salary §17(1)' },
  { value: 'perquisite_17_2', label: 'Perquisites §17(2)' },
  { value: 'exempt', label: 'Exempt (employer PF, exempt allowances)' },
  { value: 'other_sources', label: 'Other sources (interest, residual)' },
  { value: 'stcg_slab', label: 'STCG — debt (slab)' },
  { value: 'stcg_111a', label: 'STCG — equity (20%)' },
  { value: 'ltcg_112a', label: 'LTCG — equity (12.5%)' },
  { value: 'gift_56_2_x', label: 'Gift §56(2)(x)' },
  { value: 'tax_paid', label: 'TDS / advance tax / self-assessment' },
  { value: 'not_income', label: 'Not taxable (expenses, contras, cashbacks)' },
]

type Row = { label: string; value: number | null; emphasize?: boolean }

function ComputationCard({ rows, booleanRows = [] }: { rows: Row[]; booleanRows?: { label: string; value: boolean }[] }) {
  return (
    <Card>
      <div className="divide-y divide-slate-200 dark:divide-slate-700">
        {rows.map(row =>
          row.value === null ? null : (
            <div
              key={row.label}
              className={`flex items-center justify-between gap-4 px-6 py-3 ${row.emphasize ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-sm text-slate-700 dark:text-slate-300'}`}
            >
              <span>{row.label}</span>
              <MaskedAmount value={row.value} />
            </div>
          ),
        )}
        {booleanRows.map(row => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-6 py-3 text-sm text-slate-700 dark:text-slate-300">
            <span>{row.label}</span>
            <span className={row.value ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}>
              {row.value ? 'Yes' : 'No'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

type Props = {
  selected_fy: number
  include_future: boolean
  fy_options: { value: number; label: string }[]
  result: SerializedTaxCoreResult
  heads: { id: string; name: string; tax_treatment: tax_treatment | null }[]
}

export default function ClientPage({ selected_fy, include_future, fy_options, result, heads }: Props) {
  const router = useRouter()
  const c = result.computation
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const netByHead = new Map(result.per_head.map(h => [h.id, h.net]))
  const unclassifiedNet = result.unclassified_heads.reduce((s, h) => s + h.net, 0)

  const run = async (id: string, value: tax_treatment | null) => {
    setBusyId(id)
    setError(null)
    try {
      const r = await set_tax_treatment(id, value)
      if (!r.success) setError(r.message ?? "Couldn't update this head")
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const rows: Row[] = [
    { label: 'Salary §17(1)', value: c.salary_17_1 },
    { label: 'Perquisites §17(2)', value: c.perquisites_17_2 },
    { label: 'Gross salary', value: c.gross_salary, emphasize: true },
    { label: 'Standard deduction', value: -c.standard_deduction },
    { label: 'Salary income', value: c.salary_income },
    { label: 'Other sources (interest)', value: c.other_sources },
    { label: 'STCG — debt (slab)', value: c.stcg_slab },
    { label: 'Gift §56(2)(x) taxable', value: c.gift_taxable },
    { label: 'Total normal-rate income', value: c.normal_rate_income, emphasize: true },
    { label: 'STCG §111A (20%)', value: c.stcg_111a },
    { label: 'LTCG §112A gross', value: c.ltcg_112a_gross },
    { label: 'LTCG §112A exempt (₹1.25L)', value: -c.ltcg_112a_exempt },
    { label: 'LTCG §112A taxable', value: c.ltcg_112a_taxable },
  ]

  const taxRows: Row[] = [
    { label: 'Tax at slabs', value: c.tax_at_slabs },
    { label: 'Tax §111A (equity STCG)', value: c.tax_111a },
    { label: 'Tax §112A (equity LTCG)', value: c.tax_112a },
    { label: 'Tax before rebate', value: c.tax_before_rebate, emphasize: true },
    { label: '§87A rebate', value: -c.rebate_87a },
    { label: 'Surcharge', value: c.surcharge },
    { label: 'Cess (4%)', value: c.cess },
    { label: 'Total tax', value: c.total_tax, emphasize: true },
    { label: 'Tax credits (TDS + advance + self-assessment)', value: c.tax_credits },
    { label: 'Balance payable', value: c.balance_payable, emphasize: true },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Tax</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">New regime only — computed live from tagged heads, never stored.</p>
      </div>

      <section className="space-y-4">
        <SectionHeading>Computation</SectionHeading>
        <div className="flex items-center gap-3">
          <label htmlFor="tax-fy" className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Financial year
          </label>
          <select
            id="tax-fy"
            value={selected_fy}
            onChange={e => router.push(`/tax?fy=${Number(e.target.value)}${include_future ? '&projected=1' : ''}`)}
            className="px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors"
          >
            {fy_options.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={include_future}
              onChange={e => router.push(`/tax?fy=${selected_fy}${e.target.checked ? '&projected=1' : ''}`)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            />
            Project to year end
          </label>
        </div>

        {include_future ? (
          <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 p-4 text-sm text-blue-800 dark:text-blue-200">
            <span className="font-semibold">Projected —</span> includes scheduled (future) transactions as well as actuals. Only as good as what is
            actually scheduled: if the rest of the year is not in the ledger, this understates the year.
          </div>
        ) : (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Year to date — actuals only. The §87A rebate can make this read ₹0 early in the year and still leave tax due by March; tick{' '}
            <span className="font-medium">Project to year end</span> to see the full-year position.
          </div>
        )}

        {result.unclassified_heads.length > 0 && (
          <div
            role="alert"
            className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3"
          >
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86l-8.06 14a2 2 0 001.78 3h16.48a2 2 0 001.78-3l-8.06-14a2 2 0 00-3.56 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {result.unclassified_heads.length} income/expense head{result.unclassified_heads.length !== 1 ? 's' : ''} unclassified — total{' '}
                <strong>{plain_currency_fmt.format(unclassifiedNet)}</strong> excluded from this computation.
              </p>
              <ul className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                {result.unclassified_heads.map(h => (
                  <li key={h.id} className="flex justify-between gap-4 max-w-md">
                    <span>{h.name}</span>
                    <MaskedAmount value={h.net} />
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">Classify each head below before trusting this number.</p>
            </div>
          </div>
        )}

        <InfoCard
          title="Total income"
          fields={[
            {
              label: 'Total income',
              value: (
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  <MaskedAmount value={c.total_income} />
                </p>
              ),
            },
            {
              label: 'Total tax',
              value: (
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  <MaskedAmount value={c.total_tax} />
                </p>
              ),
            },
            {
              label: 'Balance payable',
              value: (
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  <MaskedAmount value={c.balance_payable} />
                </p>
              ),
            },
          ]}
        />

        <ComputationCard rows={rows} />
        <ComputationCard rows={taxRows} booleanRows={[{ label: 'Advance tax required', value: c.advance_tax_required }]} />
      </section>

      <section className="space-y-4">
        <SectionHeading>Head classification</SectionHeading>
        <Card>
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">Income / expense heads</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Tag a head to decide how it counts toward tax. Unclassified heads with activity in the selected FY are excluded and warned about above.
            </p>
            {heads.some(h => h.tax_treatment === 'gift_56_2_x') && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Gifts are treated as from non-relatives (the ledger has no relative flag): the ₹50,000 §56(2)(x) exemption only applies to relatives.
              </p>
            )}
          </div>
          {error && (
            <div className="p-4">
              <ErrorAlert message={error} onDismiss={() => setError(null)} />
            </div>
          )}
          {heads.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No income/expense heads yet.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {heads.map(head => {
                const net = netByHead.get(head.id) ?? 0
                return (
                  <div key={head.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{head.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <MaskedAmount value={net} />
                      </p>
                    </div>
                    <select
                      value={head.tax_treatment ?? ''}
                      disabled={busyId === head.id}
                      onChange={e => run(head.id, (e.target.value || null) as tax_treatment | null)}
                      className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed max-w-full"
                    >
                      <option value="">Unclassified</option>
                      {TREATMENT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
