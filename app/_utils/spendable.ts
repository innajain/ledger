import { get_subtree_head_ids } from '@/app/_utils/head_tree'

// "Spendable" is the money that is neither invested nor locked away: net worth, less the
// Investments allocation, less allocations that hold money you cannot spend (a security
// deposit is yours, and on the books, but you will not be paying rent out of it).
//
// It is net, not a cash balance. The allocations outside Investments mix set-asides that are
// funded (insurance premiums, charity) with envelopes that are overspent (discretionary,
// big-ticket), so a negative figure means the overspent envelopes outweigh what is set aside —
// not that an account is overdrawn.

export const INVESTMENTS_ALLOCATION = 'Investments'

// Allocation heads (by name, like Investments and Savings elsewhere) whose money is locked.
// Each counts with its whole subtree.
export const LOCKED_ALLOCATION_NAMES: readonly string[] = ['House Security Deposit']

type Allocation = { id: string; name: string; parent_id: string | null; total: number }

export type Spendable = {
  net_worth: number
  investments: number
  // Everything that is not Investments — net worth less investments.
  outside_investments: number
  locked: { name: string; total: number }[]
  locked_total: number
  // outside_investments less locked_total.
  spendable: number
}

const paise = (n: number) => Math.round(n * 100) / 100

// `allocations` is every allocation head of one user with its current value. Heads are
// matched by name; one that is missing counts as zero, so an account without an Investments
// head or a deposit simply has nothing to take out.
export function compute_spendable(allocations: Allocation[]): Spendable {
  const total_by_id = new Map(allocations.map(a => [a.id, a.total]))
  const sum = (ids: Iterable<string>) => paise([...ids].reduce((s, id) => s + (total_by_id.get(id) ?? 0), 0))

  const net_worth = sum(total_by_id.keys())

  // Whatever sits under Investments is invested, wherever else it might also be named.
  const invested_ids = new Set<string>()
  for (const root of allocations.filter(a => a.name === INVESTMENTS_ALLOCATION)) {
    for (const id of get_subtree_head_ids(root.id, allocations)) invested_ids.add(id)
  }

  // Each locked head with its subtree, never counting a head twice (two locked heads nested
  // in one another) and never counting money already taken out as invested.
  const counted = new Set(invested_ids)
  const locked: Spendable['locked'] = []
  for (const name of LOCKED_ALLOCATION_NAMES) {
    const ids: string[] = []
    for (const root of allocations.filter(a => a.name === name)) {
      for (const id of get_subtree_head_ids(root.id, allocations)) {
        if (counted.has(id)) continue
        counted.add(id)
        ids.push(id)
      }
    }
    if (ids.length > 0) locked.push({ name, total: sum(ids) })
  }

  const investments = sum(invested_ids)
  const outside_investments = paise(net_worth - investments)
  const locked_total = paise(locked.reduce((s, l) => s + l.total, 0))
  return { net_worth, investments, outside_investments, locked, locked_total, spendable: paise(outside_investments - locked_total) }
}
