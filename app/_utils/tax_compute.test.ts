import { describe, it, expect } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import { compute_tax, FY_2026_27, type TaxInput } from './tax_compute'
import type { tax_treatment } from '@/generated/prisma/enums'

const D = (n: number) => new Prisma.Decimal(n)

function make_input(overrides: Partial<Record<tax_treatment, Prisma.Decimal>> = {}, gift = 0): TaxInput {
  const by_treatment = {} as Record<tax_treatment, Prisma.Decimal>
  for (const k of [
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
  ] as tax_treatment[]) {
    by_treatment[k] = overrides[k] ?? D(0)
  }
  return { by_treatment, gift_non_relative_total: D(gift) }
}

describe('compute_tax', () => {
  it('tax = 0 when total income is below the rebate ceiling', () => {
    const r = compute_tax(make_input({ salary_17_1: D(1000000), other_sources: D(50000) }), FY_2026_27)
    // gross 1050000, standard deduction 75000, normal_rate_income 975000
    expect(r.total_income.toNumber()).toBe(975000)
    expect(r.rebate_87a.toNumber()).toBeGreaterThan(0)
    expect(r.total_tax.toNumber()).toBe(0)
  })

  it('rebate vanishes entirely above ₹12L income (the §87A cliff)', () => {
    // Salary high enough that after standard deduction, normal_rate_income = 1250000
    const r = compute_tax(make_input({ salary_17_1: D(1250000), other_sources: D(75000) }), FY_2026_27)
    // gross 1325000, std ded 75000, normal_rate_income 1250000
    expect(r.total_income.toNumber()).toBe(1250000)
    // total_income > 1200000, so rebate is 0
    expect(r.rebate_87a.toNumber()).toBe(0)
    // tax at slabs: 4L×0 + 4L×5% + 4L×10% + 50k×15% = 0+20000+40000+7500 = 67500
    expect(r.tax_at_slabs.toNumber()).toBe(67500)
  })

  it('§111A gain on otherwise-rebated income survives the rebate', () => {
    const r = compute_tax(
      make_input({
        salary_17_1: D(1100000),
        stcg_111a: D(89),
      }),
      FY_2026_27,
    )
    // salary income: 1100000 - 75000 = 1025000
    // total income: 1025000 + 89 = 1025089, under 12L, rebate available
    expect(r.total_income.toNumber()).toBe(1025089)
    // rebate is capped by slab tax (not total tax) so tax on 111A stays
    // tax at slabs: 4L×0 + 4L×5% + 225089×10% = 0+20000+22508.9 = 42508.9
    // But exact: let's just verify rebate is applied to slab tax and tax_111a survives
    expect(r.rebate_87a.toNumber()).toBeGreaterThan(0)
    expect(r.tax_111a.toNumber()).toBe(89 * 0.2)
    // total tax = tax_111a + 4% cess (rebate absorbs all slab tax)
    expect(r.total_tax.toNumber()).toBe(17.8 * 1.04)
  })

  it('LTCG below ₹1.25L is fully exempt', () => {
    const r = compute_tax(make_input({ ltcg_112a: D(100000) }), FY_2026_27)
    expect(r.ltcg_112a_exempt.toNumber()).toBe(100000)
    expect(r.ltcg_112a_taxable.toNumber()).toBe(0)
    expect(r.tax_112a.toNumber()).toBe(0)
  })

  it('LTCG above ₹1.25L — only excess is taxed at 12.5%', () => {
    const r = compute_tax(make_input({ ltcg_112a: D(500000) }), FY_2026_27)
    expect(r.ltcg_112a_exempt.toNumber()).toBe(125000)
    expect(r.ltcg_112a_taxable.toNumber()).toBe(375000)
    expect(r.tax_112a.toNumber()).toBe(46875) // 375000 * 12.5%
  })

  it('gifts at exactly ₹50,000 are exempt (all-or-nothing)', () => {
    const r = compute_tax(make_input({ other_sources: D(100000) }, 50000), FY_2026_27)
    expect(r.gift_taxable.toNumber()).toBe(0)
    // normal_rate_income = other_sources = 100000 (no gift added)
    expect(r.normal_rate_income.toNumber()).toBe(100000)
  })

  it('gifts at ₹50,001 are fully taxable (all-or-nothing)', () => {
    const r = compute_tax(make_input({ other_sources: D(100000) }, 50001), FY_2026_27)
    expect(r.gift_taxable.toNumber()).toBe(50001)
    // normal_rate_income = 100000 + 50001 = 150001
    expect(r.normal_rate_income.toNumber()).toBe(150001)
  })

  it('nil salary means no standard deduction', () => {
    const r = compute_tax(make_input({ other_sources: D(500000) }), FY_2026_27)
    expect(r.standard_deduction.toNumber()).toBe(0)
    expect(r.salary_income.toNumber()).toBe(0)
    expect(r.normal_rate_income.toNumber()).toBe(500000)
  })

  it('standard deduction is capped at gross salary', () => {
    // Salary less than the standard deduction amount
    const r = compute_tax(make_input({ salary_17_1: D(50000) }), FY_2026_27)
    expect(r.standard_deduction.toNumber()).toBe(50000) // can't deduct more than gross
    expect(r.salary_income.toNumber()).toBe(0)
  })

  it('tax credits reduce balance payable', () => {
    const r = compute_tax(make_input({ salary_17_1: D(1000000), other_sources: D(50000), tax_paid: D(-30000) }), FY_2026_27)
    expect(r.tax_credits.toNumber()).toBe(30000) // negative flipped
    // tax is 0 (below ceiling), credits = 30000, balance = -30000 (refund)
    expect(r.balance_payable.toNumber()).toBe(-30000)
  })
})
