/**
 * Client-side preview of the null-remainder scheme, mirroring what the server
 * does in `normalize_line_items` / `validate_line_items` (and what the MCP
 * `dry_run` flag echoes back). It is deliberately dependency-light — plain
 * numbers/strings in, plain numbers out — so the transaction form can run it on
 * every keystroke without pulling Prisma.Decimal into the client bundle.
 *
 * This is guidance only. The server stays the source of truth; nothing here
 * should ever block a submit.
 */

export type PreviewHeadType = 'account' | 'allocation' | 'income_expense'

export type PreviewLineInput = {
  accounting_head_id: string
  head_type: PreviewHeadType
  asset_id: string
  /** `asset_type` enum value; only 'rupees' is treated specially */
  asset_type: string
  quantity: number | string | null | undefined
  txn_value: number | string | null | undefined
  /** optional, only used to make messages readable */
  head_name?: string | null
  asset_name?: string | null
}

export type PreviewLine = {
  index: number
  /** the amount was left blank, so the server works it out */
  is_blank: boolean
  /** what the server will fill in for a blank amount, when it can be worked out yet */
  derived_quantity: number | null
  /** same, for the rupee value of a non-rupee line */
  derived_txn_value: number | null
  /** the final amount comes out as zero, which the ledger rejects */
  is_zero: boolean
}

export type LineItemPreview = {
  /** no structural problems found — the transaction looks well-formed */
  ok: boolean
  problems: string[]
  /** one entry per input line, in input order */
  lines: PreviewLine[]
}

const RUPEES = 'rupees'
// Guards against float noise around an exact zero. Sums are put through
// `round_amount` (the Decimal(14,4) storage precision) before this test, so a
// real imbalance of 0.0001 still survives while a 3.7e-9 residual does not.
const EPSILON = 1e-9

type Entry = {
  index: number
  input: PreviewLineInput
  quantity: number | null
  txn_value: number | null
}

type Group = {
  label: string
  is_rupees: boolean
  account: Entry[]
  allocation: Entry[]
  income_expense: Entry[]
}

function to_number(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Decimal(14,4) is the storage precision, so round the same way the DB will */
function round_amount(n: number): number {
  const rounded = Math.round(n * 1e4) / 1e4
  return Object.is(rounded, -0) ? 0 : rounded
}

function is_zero_amount(n: number): boolean {
  return Math.abs(n) <= EPSILON
}

function fmt(n: number): string {
  return String(round_amount(n))
}

function blank_count_phrase(n: number): string {
  if (n === 0) return 'none are blank'
  return `${n} ${n === 1 ? 'is' : 'are'} blank`
}

function sum_quantity(entries: Entry[]): number {
  return entries.reduce((total, e) => total + (e.quantity ?? 0), 0)
}

function sum_txn_value(entries: Entry[]): number {
  return entries.reduce((total, e) => total + (e.txn_value ?? 0), 0)
}

export function preview_line_items(items: PreviewLineInput[]): LineItemPreview {
  const lines: PreviewLine[] = items.map((_, index) => ({
    index,
    is_blank: false,
    derived_quantity: null,
    derived_txn_value: null,
    is_zero: false,
  }))

  const problems: string[] = []
  const push = (message: string) => {
    if (!problems.includes(message)) problems.push(message)
  }

  if (items.length === 0) return { ok: false, problems: ['Add at least one line item.'], lines }

  const groups = new Map<string, Group>()
  let has_incomplete_line = false

  items.forEach((input, index) => {
    const quantity = to_number(input.quantity)
    const txn_value = to_number(input.txn_value)
    lines[index].is_blank = quantity === null

    if (!input.accounting_head_id || !input.asset_id) {
      has_incomplete_line = true
      return
    }

    let group = groups.get(input.asset_id)
    if (!group) {
      group = {
        label: input.asset_name || input.asset_id,
        is_rupees: input.asset_type === RUPEES,
        account: [],
        allocation: [],
        income_expense: [],
      }
      groups.set(input.asset_id, group)
    }
    group[input.head_type].push({ index, input, quantity, txn_value })
  })

  if (has_incomplete_line) push('Pick an account and an asset on every line.')

  const multi_asset = groups.size > 1

  for (const group of groups.values()) {
    const suffix = multi_asset ? ` for ${group.label}` : ''
    const all_entries = [...group.account, ...group.allocation, ...group.income_expense]
    const needs_zero_sum = group.allocation.length === 0 || group.income_expense.length === 0

    const blank_accounts = group.account.filter(e => e.quantity === null).length
    if (blank_accounts > 0) push(`Add an amount to every account line${suffix} — ${blank_count_phrase(blank_accounts)}.`)

    const total_quantity = blank_accounts === 0 ? sum_quantity(group.account) : null

    // round to the stored precision first: float noise on large amounts is bigger than EPSILON,
    // and a residual of 3.7e-9 would otherwise be reported as "they add up to 0"
    if (needs_zero_sum && total_quantity !== null && !is_zero_amount(round_amount(total_quantity)))
      push(
        `Account amounts must add up to zero unless the transaction has both an allocation line and an income/expense line${suffix} — they add up to ${fmt(total_quantity)}.`,
      )

    for (const [entries, label] of [
      [group.allocation, 'allocation'],
      [group.income_expense, 'income/expense'],
    ] as const) {
      if (entries.length === 0) continue
      const blanks = entries.filter(e => e.quantity === null)
      if (blanks.length !== 1) {
        push(
          blanks.length === 0
            ? `Leave exactly one ${label} line blank so the rest is worked out for you${suffix} — none are blank.`
            : `Leave exactly one ${label} line blank${suffix} — ${blanks.length} are blank.`,
        )
        continue
      }
      if (total_quantity === null) continue
      const derived = round_amount(total_quantity - sum_quantity(entries))
      lines[blanks[0].index].derived_quantity = derived
      // fill it in so the zero check below sees the value the server would store
      blanks[0].quantity = derived
    }

    if (group.is_rupees) {
      if (all_entries.some(e => e.txn_value !== null)) push(`Rupee lines carry no separate value${suffix} — clear the Txn Value field.`)
    } else {
      const blank_account_values = group.account.filter(e => e.txn_value === null).length
      if (blank_account_values > 0) push(`Add a ₹ value to every account line${suffix} — ${blank_count_phrase(blank_account_values)}.`)

      const total_value = blank_account_values === 0 ? sum_txn_value(group.account) : null

      if (needs_zero_sum && total_value !== null && !is_zero_amount(round_amount(total_value)))
        push(
          `Account ₹ values must add up to zero unless the transaction has both an allocation line and an income/expense line${suffix} — they add up to ${fmt(total_value)}.`,
        )

      for (const [entries, label] of [
        [group.allocation, 'allocation'],
        [group.income_expense, 'income/expense'],
      ] as const) {
        if (entries.length === 0) continue
        const blanks = entries.filter(e => e.txn_value === null)
        if (blanks.length !== 1) {
          push(`Leave exactly one ${label} line without a ₹ value${suffix} — ${blank_count_phrase(blanks.length)}.`)
          continue
        }
        if (total_value === null) continue
        lines[blanks[0].index].derived_txn_value = round_amount(total_value - sum_txn_value(entries))
      }
    }

    for (const entry of all_entries) {
      if (entry.quantity === null) continue
      if (!is_zero_amount(round_amount(entry.quantity))) continue
      lines[entry.index].is_zero = true
      const name = entry.input.head_name
      push(name ? `“${name}” comes out as zero — drop the line or change the amounts.` : 'A line comes out as zero — drop it or change the amounts.')
    }
  }

  return { ok: problems.length === 0, problems, lines }
}
