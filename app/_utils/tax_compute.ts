import { Prisma } from '@/generated/prisma/client'
import type { tax_treatment } from '@/generated/prisma/enums'

// ── Types ────────────────────────────────────────────────────────────────

export type TaxRules = {
  slabs: [threshold: number, rate: number][]
  standard_deduction: number
  rebate_87a: { income_ceiling: number; max_rebate: number }
  cess: number
  stcg_111a_rate: number
  ltcg_112a: { rate: number; exemption: number }
  gift_aggregate_threshold: number
  surcharge: [threshold: number, rate: number][]
  advance_tax_threshold: number
}

export type TaxInput = {
  by_treatment: Record<tax_treatment, Prisma.Decimal>
  gift_non_relative_total: Prisma.Decimal
}

// One row per slab actually reached. `to: null` is the open-ended top slab.
export type SlabRow = {
  from: number
  to: number | null
  rate: number
  taxable: Prisma.Decimal
  tax: Prisma.Decimal
}

export type TaxComputation = {
  slab_breakdown: SlabRow[]
  salary_17_1: Prisma.Decimal
  perquisites_17_2: Prisma.Decimal
  gross_salary: Prisma.Decimal
  standard_deduction: Prisma.Decimal
  salary_income: Prisma.Decimal
  other_sources: Prisma.Decimal
  stcg_slab: Prisma.Decimal
  gift_taxable: Prisma.Decimal
  normal_rate_income: Prisma.Decimal
  stcg_111a: Prisma.Decimal
  ltcg_112a_gross: Prisma.Decimal
  ltcg_112a_exempt: Prisma.Decimal
  ltcg_112a_taxable: Prisma.Decimal
  total_income: Prisma.Decimal
  tax_at_slabs: Prisma.Decimal
  tax_111a: Prisma.Decimal
  tax_112a: Prisma.Decimal
  tax_before_rebate: Prisma.Decimal
  rebate_87a: Prisma.Decimal
  surcharge: Prisma.Decimal
  cess: Prisma.Decimal
  total_tax: Prisma.Decimal
  tax_credits: Prisma.Decimal
  balance_payable: Prisma.Decimal
  advance_tax_required: boolean
}

// ── Rules ────────────────────────────────────────────────────────────────

export const FY_2026_27: TaxRules = {
  slabs: [
    [400000, 0],
    [800000, 0.05],
    [1200000, 0.1],
    [1600000, 0.15],
    [2000000, 0.2],
    [2400000, 0.25],
    [Infinity, 0.3],
  ],
  standard_deduction: 75000,
  rebate_87a: { income_ceiling: 1200000, max_rebate: 60000 },
  cess: 0.04,
  stcg_111a_rate: 0.2,
  ltcg_112a: { rate: 0.125, exemption: 125000 },
  gift_aggregate_threshold: 50000,
  surcharge: [
    [5000000, 0.1],
    [10000000, 0.15],
    [20000000, 0.25],
  ],
  advance_tax_threshold: 10000,
}

// ── Helpers ──────────────────────────────────────────────────────────────

const ZERO = new Prisma.Decimal(0)

function tax_at_slabs(income: Prisma.Decimal, slabs: TaxRules['slabs']): { tax: Prisma.Decimal; breakdown: SlabRow[] } {
  let tax = ZERO
  let prev = ZERO
  const breakdown: SlabRow[] = []
  for (const [threshold, rate] of slabs) {
    if (income.lessThanOrEqualTo(prev)) break
    const upper = new Prisma.Decimal(threshold === Infinity ? income.toString() : threshold)
    const taxable = Prisma.Decimal.min(income, upper).sub(prev)
    const slab_tax = taxable.mul(rate)
    // Emit the nil slab too — seeing the first ₹4L taxed at nothing is the point
    // of showing a breakdown at all.
    breakdown.push({ from: prev.toNumber(), to: threshold === Infinity ? null : threshold, rate, taxable, tax: slab_tax })
    tax = tax.add(slab_tax)
    prev = upper
  }
  return { tax, breakdown }
}

function compute_surcharge(total_income: Prisma.Decimal, base_tax: Prisma.Decimal, surcharge_slabs: TaxRules['surcharge']): Prisma.Decimal {
  let rate = new Prisma.Decimal(0)
  for (const [threshold, r] of surcharge_slabs) {
    if (total_income.greaterThan(threshold)) rate = new Prisma.Decimal(r)
  }
  if (rate.equals(ZERO)) return ZERO
  return base_tax.mul(rate)
}

// ── Main computation ─────────────────────────────────────────────────────

export function compute_tax(input: TaxInput, rules: TaxRules): TaxComputation {
  const { by_treatment, gift_non_relative_total } = input
  const D = (k: tax_treatment) => by_treatment[k] ?? ZERO

  // §17(1) salary (gross, incl. employee PF)
  const salary_17_1 = D('salary_17_1')
  const perquisites_17_2 = D('perquisite_17_2')
  const gross_salary = salary_17_1.add(perquisites_17_2)

  // Standard deduction: only if salary income exists, capped at gross salary
  const standard_deduction = gross_salary.greaterThan(ZERO) ? Prisma.Decimal.min(new Prisma.Decimal(rules.standard_deduction), gross_salary) : ZERO
  const salary_income = gross_salary.sub(standard_deduction)

  // Normal-rate income
  const other_sources = D('other_sources')
  const stcg_slab = D('stcg_slab')

  // §56(2)(x): all-or-nothing — if aggregate > ₹50,000, fully taxable
  const gift_taxable = gift_non_relative_total.greaterThan(rules.gift_aggregate_threshold) ? gift_non_relative_total : ZERO

  const normal_rate_income = salary_income.add(other_sources).add(stcg_slab).add(gift_taxable)

  // Special-rate heads (not part of slab computation)
  const stcg_111a = D('stcg_111a')
  const ltcg_112a_gross = D('ltcg_112a')

  // §112A exemption: first ₹1,25,000 of gains exempt (applied before rate)
  const ltcg_112a_exempt = Prisma.Decimal.min(ltcg_112a_gross, new Prisma.Decimal(rules.ltcg_112a.exemption))
  const ltcg_112a_taxable = ltcg_112a_gross.sub(ltcg_112a_exempt)

  // Total income (normal + special-rate)
  const total_income = normal_rate_income.add(stcg_111a).add(ltcg_112a_taxable)

  // Tax computation
  const { tax: tax_at_slab_rate, breakdown: slab_breakdown } = tax_at_slabs(normal_rate_income, rules.slabs)
  const tax_111a = stcg_111a.mul(rules.stcg_111a_rate)
  const tax_112a = ltcg_112a_taxable.mul(rules.ltcg_112a.rate)
  const tax_before_rebate = tax_at_slab_rate.add(tax_111a).add(tax_112a)

  // §87A rebate: NOT available against special-rate income — apply only to slab tax
  const rebate_87a = total_income.lessThanOrEqualTo(rules.rebate_87a.income_ceiling)
    ? Prisma.Decimal.min(tax_at_slab_rate, new Prisma.Decimal(rules.rebate_87a.max_rebate))
    : ZERO

  // Cess is 4% of (tax after rebate + surcharge)
  const tax_after_rebate = tax_before_rebate.sub(rebate_87a)
  const surcharge = compute_surcharge(total_income, tax_after_rebate, rules.surcharge)
  const tax_after_surcharge = tax_after_rebate.add(surcharge)
  const cess = tax_after_surcharge.mul(rules.cess)
  const total_tax = tax_after_surcharge.add(cess)

  // Tax credits (TDS + advance + self-assessment). Tax-paid heads arrive
  // negative (ledger convention); flip the sign.
  const tax_credits = D('tax_paid').neg()

  const balance_payable = total_tax.sub(tax_credits)
  // §208: advance tax is payable where the liability after TDS is ten thousand
  // rupees "or more" — so the threshold is inclusive.
  const advance_tax_required = balance_payable.greaterThanOrEqualTo(rules.advance_tax_threshold)

  return {
    slab_breakdown,
    salary_17_1,
    perquisites_17_2,
    gross_salary,
    standard_deduction,
    salary_income,
    other_sources,
    stcg_slab,
    gift_taxable,
    normal_rate_income,
    stcg_111a,
    ltcg_112a_gross,
    ltcg_112a_exempt,
    ltcg_112a_taxable,
    total_income,
    tax_at_slabs: tax_at_slab_rate,
    tax_111a,
    tax_112a,
    tax_before_rebate,
    rebate_87a,
    surcharge,
    cess,
    total_tax,
    tax_credits,
    balance_payable,
    advance_tax_required,
  }
}
