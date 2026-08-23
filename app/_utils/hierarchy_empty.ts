/**
 * Pure helpers behind the "Hide empty" toggle on the hierarchy pages (accounts / assets).
 *
 * A node is "empty" only when it and every single descendant is individually zero, so a subtree
 * holding real money is never pruned away and made unreachable — a group whose children cancel out
 * (a +2,500 wallet next to a -2,500 postpaid) still carries money and still shows. Totals are
 * floats derived from Decimal sums, so zero is an epsilon comparison, never `=== 0`.
 */

export const ZERO_EPSILON = 1e-9

export type HierarchyNode<T> = { item: T; children: HierarchyNode<T>[] }

export function is_zero_total(value: number): boolean {
  return Math.abs(value) < ZERO_EPSILON
}

/** Node's own total plus every descendant's. Signed — this is the number the row displays. */
export function aggregate_total<T extends { id: string }>(node: HierarchyNode<T>, totals: Map<string, number>): number {
  const own = totals.get(node.item.id) || 0
  return node.children.reduce((sum, child) => sum + aggregate_total(child, totals), own)
}

/**
 * True when neither the node nor anything under it carries value — i.e. the whole subtree can be
 * pruned. Deliberately *not* `is_zero_total(aggregate_total(...))`: a signed aggregate is zero
 * whenever descendants cancel, which would hide rows that hold real money.
 */
export function is_empty_subtree<T extends { id: string }>(node: HierarchyNode<T>, totals: Map<string, number>): boolean {
  if (!is_zero_total(totals.get(node.item.id) || 0)) return false
  return node.children.every(child => is_empty_subtree(child, totals))
}

/**
 * How many rows the toggle actually removes: the *root* of each pruned subtree, counted once —
 * an empty group with four empty children reads as one hidden group, matching what the user sees
 * disappear from the level they were looking at. Descends only into subtrees that survive.
 *
 * Nodes that are already hidden by the inactive rule (inactive + zero) are skipped: switching the
 * toggle off would not bring them back, so counting them would overstate what is hidden.
 */
export function count_empty_subtrees<T extends { id: string; is_active: boolean }>(nodes: HierarchyNode<T>[], totals: Map<string, number>): number {
  let count = 0
  for (const node of nodes) {
    if (is_empty_subtree(node, totals)) {
      if (node.item.is_active) count += 1
      continue
    }
    count += count_empty_subtrees(node.children, totals)
  }
  return count
}
