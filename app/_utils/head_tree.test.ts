import { describe, it, expect } from 'vitest'
import { get_subtree_head_ids, get_ancestor_head_ids } from './head_tree'

// Bank ▸ Groww ▸ Demat ▸ MF Holdings, plus an unrelated root.
const HEADS = [
  { id: 'bank', parent_id: null },
  { id: 'groww', parent_id: 'bank' },
  { id: 'demat', parent_id: 'groww' },
  { id: 'mf', parent_id: 'demat' },
  { id: 'balance', parent_id: 'groww' },
  { id: 'cash', parent_id: null },
]

describe('get_subtree_head_ids', () => {
  it('walks down to every descendant, including the root', () => {
    expect([...get_subtree_head_ids('groww', HEADS)].sort()).toEqual(['balance', 'demat', 'groww', 'mf'])
  })

  it('is just the head itself for a leaf', () => {
    expect([...get_subtree_head_ids('mf', HEADS)]).toEqual(['mf'])
  })
})

describe('get_ancestor_head_ids', () => {
  it('walks up to every ancestor, keeping the seed', () => {
    expect([...get_ancestor_head_ids(['mf'], HEADS)].sort()).toEqual(['bank', 'demat', 'groww', 'mf'])
  })

  // The invalidation contract: a write on a leaf has to reach every head whose
  // "including sub-heads" view covers that leaf, or those views serve stale figures.
  it('covers each seed independently and merges shared ancestors once', () => {
    expect([...get_ancestor_head_ids(['mf', 'balance'], HEADS)].sort()).toEqual(['balance', 'bank', 'demat', 'groww', 'mf'])
  })

  it('is just the head itself for a root', () => {
    expect([...get_ancestor_head_ids(['cash'], HEADS)]).toEqual(['cash'])
  })

  it('returns empty for no seeds', () => {
    expect(get_ancestor_head_ids([], HEADS).size).toBe(0)
  })

  it('ignores a parent_id that names no known head', () => {
    expect([...get_ancestor_head_ids(['orphan'], [{ id: 'orphan', parent_id: 'gone' }])].sort()).toEqual(['gone', 'orphan'])
  })

  it('terminates on a parent cycle instead of looping forever', () => {
    const cyclic = [
      { id: 'a', parent_id: 'b' },
      { id: 'b', parent_id: 'a' },
    ]
    expect([...get_ancestor_head_ids(['a'], cyclic)].sort()).toEqual(['a', 'b'])
  })
})
