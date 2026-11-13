import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { ist_midnight, ist_ymd } from '@/app/_utils/ist_date'
import { ActionError } from '@/app/_actions/_result'
import { compute_daily_balance_interest, type DailyMovement } from '@/app/_utils/savings_interest'
import { inclusive_days } from '@/app/_utils/interest_periods'

// Every day in the window is walked once, so the window is bounded: ten years is far past
// any real reconciliation and keeps a typo'd year from walking centuries.
const MAX_DAYS = 3660

export type ExpectedInterest = {
  from: string
  to: string
  days: number
  rate_pct: number
  average_balance: number
  lowest_balance: number
  highest_balance: number
  negative_days: number
  // Exact to the paisa, and what a bank would actually credit (nearest rupee).
  interest: number
  interest_rounded: number
  // The period runs past today, so the later days are a projection: scheduled
  // transactions are folded in and nothing after today has really closed.
  projected: boolean
}

// Savings interest a bank would pay on these heads over the inclusive IST days
// [from, to] (yyyy-MM-dd) at rate_pct a year: daily closing balance x rate/365, summed
// (see savings_interest.ts). Callers resolve and authorise the heads; this takes ids.
//
// Only rupee holdings count. Interest accrues on cash, and a head that also holds units
// (a demat account) would otherwise earn "interest" on their book value.
//
// Days are cut on each line's EFFECTIVE datetime (li.datetime ?? txn.datetime), the rule
// closing_balance_core uses, so this agrees with "Balance on a date" day for day — and a
// refund or reversal that settled later than its transaction needs its own line datetime
// to land on the day the bank counted it.
//
// A period ending after today is a projection and follows closing_balance_core's rule for
// a future cutoff: scheduled (is_future) transactions dated inside it are counted.
export async function expected_interest_core(
  user_id: string,
  head_ids: string[],
  from: string,
  to: string,
  rate_pct: number,
): Promise<ExpectedInterest> {
  if (typeof rate_pct !== 'number' || !Number.isFinite(rate_pct) || rate_pct <= 0 || rate_pct > 100) {
    throw new ActionError('VALIDATION', 'Rate must be more than 0 and at most 100% a year')
  }
  let days: number
  try {
    days = inclusive_days(from, to)
  } catch (error) {
    throw new ActionError('VALIDATION', error instanceof Error ? error.message : 'Invalid period')
  }
  if (days > MAX_DAYS) throw new ActionError('VALIDATION', 'Pick a period of ten years or less')

  const cutoff = new Date(ist_midnight(to).getTime() + 24 * 60 * 60 * 1000)
  const projected = to > ist_ymd(new Date())
  const heads = new Set(head_ids)

  // Keep every line item of each matched transaction — null-remainder normalization needs
  // the full balanced set — but select only the fields it reads.
  const txns = heads.size
    ? await prisma.transaction.findMany({
        where: {
          user_id,
          ...(projected ? {} : NOT_FUTURE),
          line_items: { some: { accounting_head_id: { in: [...heads] } } },
          // Prune in SQL what the effective-date filter below would drop anyway.
          OR: [{ datetime: { lt: cutoff } }, { line_items: { some: { datetime: { lt: cutoff } } } }],
        },
        select: {
          datetime: true,
          line_items: {
            select: {
              accounting_head_id: true,
              quantity: true,
              txn_value: true,
              datetime: true,
              accounting_head: { select: { type: true } },
              asset: { select: { id: true, type: true, name: true } },
            },
          },
        },
      })
    : []

  const movements: DailyMovement[] = []
  for (const t of txns) {
    for (const li of normalize_line_items(t.line_items)) {
      const at = li.datetime ?? t.datetime
      if (at >= cutoff || !heads.has(li.accounting_head_id) || li.asset.type !== 'rupees') continue
      movements.push({ day: ist_ymd(at), amount: li.quantity })
    }
  }

  // The whole history goes in with a zero opening balance: the walk folds everything
  // dated before `from` into the opening balance itself.
  const r = compute_daily_balance_interest({
    opening_balance: new Prisma.Decimal(0),
    movements,
    from,
    to,
    annual_rate_pct: new Prisma.Decimal(rate_pct),
  })
  const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2).toNumber()
  return {
    from,
    to,
    days: r.days,
    rate_pct,
    average_balance: money(r.average_balance),
    lowest_balance: money(r.lowest_balance),
    highest_balance: money(r.highest_balance),
    negative_days: r.negative_days,
    interest: money(r.interest),
    interest_rounded: r.interest_rounded.toNumber(),
    projected,
  }
}
