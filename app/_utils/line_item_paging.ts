// Line-item lists on the head and asset pages ship one page of rows with the HTML and
// fetch the rest on "Show more". A busy head or the rupees asset has thousands of rows;
// sending them all made those pages 1-1.5 MB. The list box shows about five rows before
// it scrolls, so 30 covers a first look and a little scrolling.

export const LINE_ITEMS_PAGE = 30

/**
 * The page of `rows` that starts at `offset`, or null when the offset is not a
 * non-negative whole number (it comes from the browser, so it is checked here).
 */
export function line_item_page<T>(rows: T[], offset: number, size: number = LINE_ITEMS_PAGE): T[] | null {
  if (!Number.isSafeInteger(offset) || offset < 0) return null
  return rows.slice(offset, offset + size)
}
