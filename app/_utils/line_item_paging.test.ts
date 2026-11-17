import { describe, expect, it } from 'vitest'
import { LINE_ITEMS_PAGE, line_item_page } from './line_item_paging'

const rows = Array.from({ length: 250 }, (_, i) => i)

describe('line_item_page', () => {
  it('returns one page from the offset', () => {
    expect(line_item_page(rows, 0)).toEqual(rows.slice(0, LINE_ITEMS_PAGE))
    expect(line_item_page(rows, 100)).toEqual(rows.slice(100, 200))
  })

  it('returns the short tail and then nothing', () => {
    expect(line_item_page(rows, 200)).toEqual(rows.slice(200))
    expect(line_item_page(rows, 250)).toEqual([])
    expect(line_item_page(rows, 900)).toEqual([])
  })

  it('honours a custom page size', () => {
    expect(line_item_page(rows, 10, 5)).toEqual([10, 11, 12, 13, 14])
  })

  it('rejects offsets that are not non-negative whole numbers', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) expect(line_item_page(rows, bad)).toBeNull()
  })
})
