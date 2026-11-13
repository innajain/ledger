import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { ist_midnight, ist_ymd } from '@/app/_utils/ist_date'
import { ActionError } from '@/app/_actions/_result'
import { compute_daily_balance_interest, type DailyMovement } from '@/app/_utils/savings_interest'
import { inclusive_days } from '@/app/_utils/interest_periods'
import {
  parse_saved_interest_settings,
  validate_interest_config,
  validate_interest_settings,
  type InterestConfig,
  type InterestSettings,
} from '@/app/_utils/interest_config'

// Every day in the window is walked once, so the window is bounded: ten years is far past
// any real reconciliation and keeps a typo'd year from walking centuries.
const MAX_DAYS = 3660

export type ExpectedInterest = {
  from: string
  to: string
  days: number
  // The settings the figure was worked out with, echoed so a result is self-describing.
  config: InterestConfig
  average_balance: number
  lowest_balance: number
  highest_balance: number
  negative_days: number
  // Exact to the paisa (the sum of each day's paisa when the config rounds each day)...
  interest: number
  // ...and what a bank would actually credit, rounded the way the config says.
  interest_rounded: number
  // Where the interest came from, one entry per rate band, before any per-day rounding.
  by_slab: { up_to: number | null; rate_pct: number; interest: number }[]
  // The period runs past today, so the later days are a projection: scheduled
  // transactions are folded in and nothing after today has really closed.
  projected: boolean
}

// Savings interest a bank would pay on these heads over the inclusive IST days
// [from, to] (yyyy-MM-dd): each day's closing balance earns its band's rate ÷ days in the
// year, summed and rounded as `config` says (see savings_interest.ts). `config` is
// untrusted input from a client or a tool call and is validated here. Callers resolve and
// authorise the heads; this takes ids.
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
  raw_config: unknown,
): Promise<ExpectedInterest> {
  let config: InterestConfig
  try {
    config = validate_interest_config(raw_config)
  } catch (error) {
    throw new ActionError('VALIDATION', error instanceof Error ? error.message : 'Invalid interest settings')
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
    config,
  })
  const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2).toNumber()
  return {
    from,
    to,
    days: r.days,
    config,
    average_balance: money(r.average_balance),
    lowest_balance: money(r.lowest_balance),
    highest_balance: money(r.highest_balance),
    negative_days: r.negative_days,
    interest: money(r.interest),
    interest_rounded: r.interest_rounded.toNumber(),
    by_slab: r.by_slab.map(s => ({ up_to: s.up_to, rate_pct: s.rate_pct, interest: money(s.interest) })),
    projected,
  }
}

// The rate card saved on an account, or null when none is saved (or what is stored no
// longer passes validation — see parse_saved_interest_settings). Scoped to the caller's own
// heads: another user's head id reads as nothing saved.
export async function load_interest_settings(user_id: string, head_id: string): Promise<InterestSettings | null> {
  const head = await prisma.accounting_head.findUnique({ where: { id: head_id, user_id }, select: { interest_settings: true } })
  return parse_saved_interest_settings(head?.interest_settings)
}

// Saves a rate card on one of the caller's accounts, or clears it with null. `raw` is
// untrusted input and is validated here. This is a label on the account, like lock_date's
// sibling settings: it changes no balance, so nothing is invalidated and a linked
// counterparty's copy is untouched.
export async function save_interest_settings_core(user_id: string, head_id: string, raw: unknown): Promise<InterestSettings | null> {
  const head = await prisma.accounting_head.findUnique({ where: { id: head_id, user_id }, select: { type: true } })
  if (!head) throw new ActionError('NOT_FOUND', 'Head not found')
  if (head.type !== 'account') throw new ActionError('VALIDATION', 'Interest settings are for accounts only')

  if (raw === null) {
    await prisma.accounting_head.update({ where: { id: head_id, user_id }, data: { interest_settings: Prisma.DbNull } })
    return null
  }
  let settings: InterestSettings
  try {
    settings = validate_interest_settings(raw)
  } catch (error) {
    throw new ActionError('VALIDATION', error instanceof Error ? error.message : 'Invalid interest settings')
  }
  await prisma.accounting_head.update({ where: { id: head_id, user_id }, data: { interest_settings: settings } })
  return settings
}
