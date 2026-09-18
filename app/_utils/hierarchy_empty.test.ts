import { describe, it, expect } from 'vitest'
import { aggregate_total, count_empty_subtrees, fold_single_child, is_empty_subtree, is_zero_total, type HierarchyNode } from './hierarchy_empty'

type Item = { id: string; is_active: boolean }

function node(id: string, children: HierarchyNode<Item>[] = [], is_active = true): HierarchyNode<Item> {
  return { item: { id, is_active }, children }
}

describe('is_zero_total', () => {
  it('treats float noise as zero but not real paise', () => {
    expect(is_zero_total(0)).toBe(true)
    expect(is_zero_total(-0)).toBe(true)
    expect(is_zero_total(1e-12)).toBe(true)
    expect(is_zero_total(0.0001)).toBe(false)
    expect(is_zero_total(-56422.6)).toBe(false)
  })
})

describe('aggregate_total', () => {
  it('sums a node and all of its descendants', () => {
    const tree = node('bank', [node('kotak'), node('idfc'), node('upi', [node('lite')])])
    const totals = new Map([
      ['bank', 10],
      ['kotak', 56422.6],
      ['idfc', 0],
      ['lite', 5],
    ])
    expect(aggregate_total(tree, totals)).toBeCloseTo(56437.6, 6)
  })

  it('treats a missing total as zero', () => {
    expect(aggregate_total(node('ghost'), new Map())).toBe(0)
  })
})

describe('is_empty_subtree', () => {
  it('keeps a zero parent that has a non-zero descendant', () => {
    const tree = node('bank', [node('kotak')])
    expect(is_empty_subtree(tree, new Map([['kotak', 56422.6]]))).toBe(false)
  })

  it('prunes a subtree where everything is zero', () => {
    const tree = node('upi', [node('lite-1'), node('lite-2')])
    expect(
      is_empty_subtree(
        tree,
        new Map([
          ['lite-1', 0],
          ['lite-2', 0],
        ]),
      ),
    ).toBe(true)
  })

  it('does not prune a subtree that nets to zero only because of opposite signs', () => {
    const tree = node('wallets', [node('a'), node('b')])
    const totals = new Map([
      ['a', 500],
      ['b', -500],
    ])
    // The aggregate is zero, but both children hold ₹500 — pruning here would make them unreachable.
    expect(is_empty_subtree(tree, totals)).toBe(false)
    expect(is_empty_subtree(node('a'), totals)).toBe(false)
  })
})

describe('count_empty_subtrees', () => {
  const totals = new Map([
    ['bank', 0],
    ['kotak', 56422.6],
    ['idfc', 0],
    ['pnb', 0],
    ['sbi', 0],
    ['slice', 0],
    ['upi', 0],
    ['upi-1', 0],
    ['upi-2', 0],
    ['upi-3', 0],
  ])
  const roots = [
    node('bank', [node('kotak'), node('idfc'), node('pnb'), node('sbi'), node('slice')]),
    node('upi', [node('upi-1'), node('upi-2'), node('upi-3')]),
  ]

  it('counts pruned subtree roots once, not every node inside them', () => {
    // 4 empty children of Bank + the whole UPI group (its 3 empty children are not counted again).
    expect(count_empty_subtrees(roots, totals)).toBe(5)
  })

  it('counts nothing when every branch carries value', () => {
    expect(count_empty_subtrees([node('kotak')], new Map([['kotak', 1]]))).toBe(0)
  })

  it('ignores inactive empty nodes, which are hidden with or without the toggle', () => {
    const tree = [node('bank', [node('kotak'), node('old', [], false), node('idfc')])]
    expect(count_empty_subtrees(tree, new Map([['kotak', 100]]))).toBe(1)
  })

  it('still counts an active empty parent that contains inactive empty children', () => {
    const tree = [node('live', [node('closed-a', [], false), node('closed-b', [], false)]), node('kotak')]
    expect(count_empty_subtrees(tree, new Map([['kotak', 100]]))).toBe(1)
  })
})

describe('fold_single_child', () => {
  const all = (n: HierarchyNode<Item>) => n.children

  it('renders an empty wrapper as its only child', () => {
    const tree = node('bank', [node('kotak')])
    expect(fold_single_child(tree, new Map([['kotak', 13811.23]]), all).item.id).toBe('kotak')
  })

  it('collapses a chain of wrappers down to the one row that matters', () => {
    const tree = node('a', [node('b', [node('c')])])
    expect(fold_single_child(tree, new Map([['c', 5]]), all).item.id).toBe('c')
  })

  it('keeps a wrapper that holds money of its own', () => {
    const tree = node('other-people', [node('meal-provider')])
    const totals = new Map([
      ['other-people', -30000],
      ['meal-provider', -4560],
    ])
    expect(fold_single_child(tree, totals, all).item.id).toBe('other-people')
  })

  it('keeps a wrapper with more than one child', () => {
    const tree = node('cash', [node('wallet'), node('coin-pouch')])
    expect(fold_single_child(tree, new Map([['wallet', 1770]]), all).item.id).toBe('cash')
  })

  it('keeps a leaf as itself', () => {
    expect(fold_single_child(node('kotak'), new Map(), all).item.id).toBe('kotak')
  })

  it('folds against the visible children, not every child', () => {
    const tree = node('bank', [node('kotak'), node('closed-idfc')])
    const totals = new Map([['kotak', 13811.23]])
    const visible = (n: HierarchyNode<Item>) => n.children.filter(c => !is_empty_subtree(c, totals))
    expect(fold_single_child(tree, totals, visible).item.id).toBe('kotak')
    expect(fold_single_child(tree, totals, all).item.id).toBe('bank')
  })

  it('never folds an inactive node away, on either side', () => {
    const parent = node('bank', [node('kotak', [], false)])
    expect(fold_single_child(parent, new Map([['kotak', 5]]), all).item.id).toBe('bank')
    const inactiveParent = node('bank', [node('kotak')], false)
    expect(fold_single_child(inactiveParent, new Map([['kotak', 5]]), all).item.id).toBe('bank')
  })
})
