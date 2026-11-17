import { describe, expect, it } from 'vitest'
import { LINE_ITEMS_PAGE, line_item_page } from './line_item_paging'

const PAGE = LINE_ITEMS_PAGE
// Two full pages and a short third one, whatever the page size is.
const rows = Array.from({ length: 2 * PAGE + 7 }, (_, i) => i)

describe('line_item_page', () => {
  it('returns one page from the offset', () => {
    expect(line_item_page(rows, 0)).toEqual(rows.slice(0, PAGE))
    expect(line_item_page(rows, PAGE)).toEqual(rows.slice(PAGE, 2 * PAGE))
  })

  it('returns the short tail and then nothing', () => {
    expect(line_item_page(rows, 2 * PAGE)).toEqual(rows.slice(2 * PAGE))
    expect(line_item_page(rows, 2 * PAGE)?.length).toBe(7)
    expect(line_item_page(rows, rows.length)).toEqual([])
    expect(line_item_page(rows, rows.length + 900)).toEqual([])
  })

  it('honours a custom page size', () => {
    expect(line_item_page(rows, 10, 5)).toEqual([10, 11, 12, 13, 14])
  })

  it('rejects offsets that are not non-negative whole numbers', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 60]) expect(line_item_page(rows, bad)).toBeNull()
  })
})
