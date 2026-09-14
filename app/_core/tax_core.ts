import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { financial_year_window } from '@/app/_utils/financial_year'
import { compute_tax, FY_2026_27, type TaxComputation, type TaxInput } from '@/app/_utils/tax_compute'
import type { tax_treatment } from '@/generated/prisma/enums'

type HeadBreakdown = {
  id: string
  name: string
  treatment: tax_treatment | null
  net: Prisma.Decimal
}

export type TaxCoreResult = {
  computation: TaxComputation
  unclassified_heads: { id: string; name: string; net: Prisma.Decimal }[]
  per_head: HeadBreakdown[]
}

// JSON-safe shape for crossing the server→client (page) and server→tool (MCP)
// boundary. Both consumers get the exact same rendering, so any divergence
// between /tax and get_tax_computation is a routing bug, not a rounding one.
export type SerializedComputation = {
  [K in keyof TaxComputation]: TaxComputation[K] extends boolean ? boolean : number
}

export type SerializedTaxCoreResult = {
  computation: SerializedComputation
  unclassified_heads: { id: string; name: string; net: number }[]
  per_head: { id: string; name: string; treatment: tax_treatment | null; net: number }[]
}

export function serialize_tax_result(r: TaxCoreResult): SerializedTaxCoreResult {
  const c = r.computation
  return {
    computation: {
      salary_17_1: c.salary_17_1.toNumber(),
      perquisites_17_2: c.perquisites_17_2.toNumber(),
      gross_salary: c.gross_salary.toNumber(),
      standard_deduction: c.standard_deduction.toNumber(),
      salary_income: c.salary_income.toNumber(),
      other_sources: c.other_sources.toNumber(),
      stcg_slab: c.stcg_slab.toNumber(),
      gift_taxable: c.gift_taxable.toNumber(),
      normal_rate_income: c.normal_rate_income.toNumber(),
      stcg_111a: c.stcg_111a.toNumber(),
      ltcg_112a_gross: c.ltcg_112a_gross.toNumber(),
      ltcg_112a_exempt: c.ltcg_112a_exempt.toNumber(),
      ltcg_112a_taxable: c.ltcg_112a_taxable.toNumber(),
      total_income: c.total_income.toNumber(),
      tax_at_slabs: c.tax_at_slabs.toNumber(),
      tax_111a: c.tax_111a.toNumber(),
      tax_112a: c.tax_112a.toNumber(),
      tax_before_rebate: c.tax_before_rebate.toNumber(),
      rebate_87a: c.rebate_87a.toNumber(),
      surcharge: c.surcharge.toNumber(),
      cess: c.cess.toNumber(),
      total_tax: c.total_tax.toNumber(),
      tax_credits: c.tax_credits.toNumber(),
      balance_payable: c.balance_payable.toNumber(),
      advance_tax_required: c.advance_tax_required,
    },
    unclassified_heads: r.unclassified_heads.map(h => ({ ...h, net: h.net.toNumber() })),
    per_head: r.per_head.map(h => ({ ...h, net: h.net.toNumber() })),
  }
}

const ZERO = new Prisma.Decimal(0)

const TREATMENTS = [
  'salary_17_1',
  'perquisite_17_2',
  'exempt',
  'other_sources',
  'stcg_slab',
  'stcg_111a',
  'ltcg_112a',
  'gift_56_2_x',
  'tax_paid',
  'not_income',
] as const

// include_future folds scheduled (is_future) transactions into the computation,
// turning the year-to-date figure into a projection built from the user's own
// forecast rather than an extrapolated run rate. Off by default: the default must
// stay "what has actually happened".
export async function compute_tax_for_fy(user_id: string, fy_start_year: number, include_future = false): Promise<TaxCoreResult> {
  const { from, to } = financial_year_window(fy_start_year)

  const txns = await prisma.transaction.findMany({
    where: {
      user_id,
      ...(include_future ? {} : NOT_FUTURE),
      line_items: { some: { accounting_head: { type: 'income_expense' } } },
      // Superset prefilter so this never scans all history: a transaction matters if
      // its own datetime lands in the window, or if any line item is overridden into
      // it. Whole transactions are fetched (normalisation needs every leg) and the
      // precise per-line cut happens below.
      OR: [{ datetime: { gte: from, lt: to } }, { line_items: { some: { datetime: { gte: from, lt: to } } } }],
    },
    select: {
      id: true,
      datetime: true,
      line_items: {
        select: {
          id: true,
          accounting_head: { select: { id: true, name: true, type: true, tax_treatment: true } },
          asset: { select: { id: true, type: true, name: true } },
          quantity: true,
          txn_value: true,
          datetime: true,
        },
      },
    },
  })

  const by_treatment = {} as Record<tax_treatment, Prisma.Decimal>
  for (const k of TREATMENTS) by_treatment[k] = ZERO

  const net_by_head = new Map<string, HeadBreakdown>()
  let gift_non_relative_total = ZERO

  for (const t of txns) {
    // Normalise the COMPLETE transaction first. normalize_line_items derives the
    // null-remainder leg from the account lines and throws outright if the null
    // entry is missing, so it must never be handed a date-filtered subset — a
    // transaction whose line items straddle the FY boundary would crash it.
    const normalized = normalize_line_items(t.line_items)
    for (const li of normalized) {
      if (li.accounting_head.type !== 'income_expense') continue
      // Precise per-line cut, on the effective date, matching closing_balance_core.
      const effective_date = li.datetime ?? t.datetime
      if (effective_date < from || effective_date >= to) continue
      const head_id = li.accounting_head.id
      const treatment: tax_treatment | null = li.accounting_head.tax_treatment ?? null
      const amount = li.txn_value

      if (treatment) {
        by_treatment[treatment] = by_treatment[treatment].add(amount)
      }

      const existing = net_by_head.get(head_id)
      if (existing) {
        existing.net = existing.net.add(amount)
      } else {
        net_by_head.set(head_id, {
          id: head_id,
          name: li.accounting_head.name,
          treatment,
          net: amount,
        })
      }

      if (treatment === 'gift_56_2_x') {
        gift_non_relative_total = gift_non_relative_total.add(amount)
      }
    }
  }

  const input: TaxInput = { by_treatment, gift_non_relative_total }
  const computation = compute_tax(input, FY_2026_27)

  const unclassified_heads = [...net_by_head.values()]
    .filter(h => h.treatment === null && !h.net.equals(ZERO))
    .map(h => ({ id: h.id, name: h.name, net: h.net }))

  const per_head = [...net_by_head.values()].sort((a, b) => b.net.abs().sub(a.net.abs()).toNumber())

  return { computation, unclassified_heads, per_head }
}
