/**
 * Pure walks over the accounting-head hierarchy — no DB, no cache, just `{id, parent_id}`
 * rows. Kept apart from subtree_value.ts, which is `server-only` because it reaches for
 * Prisma and Redis; these are the parts worth unit-testing on their own.
 */

type HeadRow = { id: string; parent_id: string | null }

/** The root plus every descendant — what an "including sub-heads" view covers. */
export function get_subtree_head_ids(root_id: string, heads: HeadRow[]): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const h of heads) {
    if (!h.parent_id) continue
    const arr = childrenByParent.get(h.parent_id) ?? []
    arr.push(h.id)
    childrenByParent.set(h.parent_id, arr)
  }

  const ids = new Set<string>([root_id])
  const stack = [root_id]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child_id of childrenByParent.get(current) ?? []) {
      if (ids.has(child_id)) continue
      ids.add(child_id)
      stack.push(child_id)
    }
  }
  return ids
}

/**
 * The given heads plus every ancestor of each — the walk up, mirroring the walk down.
 *
 * Cache invalidation needs it: a line item on a head changes that head's own figures and
 * the "including sub-heads" figures of every head above it, none of which the write ever
 * names. Tolerates a malformed parent cycle (stops rather than looping) and a parent_id
 * pointing at a head that isn't in `heads`.
 */
export function get_ancestor_head_ids(seed_ids: Iterable<string>, heads: HeadRow[]): Set<string> {
  const out = new Set(seed_ids)
  if (out.size === 0) return out
  const parent_of = new Map(heads.map(h => [h.id, h.parent_id]))
  // Dedupes work across seeds that share ancestors, and is what makes a cycle terminate.
  const climbed = new Set<string>()
  for (const id of out) {
    let cur = parent_of.get(id) ?? null
    while (cur && !climbed.has(cur)) {
      climbed.add(cur)
      out.add(cur)
      cur = parent_of.get(cur) ?? null
    }
  }
  return out
}
