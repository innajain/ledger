'use client'

import { useEffect } from 'react'

/** How long a scrollbar stays visible after its box stops scrolling. */
const HIDE_AFTER_MS = 1200

/**
 * Scrollbars that show while you scroll and hide shortly after, on every platform — the
 * OS overlay behaviour can't be relied on (Windows has none, and macOS drops it with a
 * mouse attached). Stamps `data-scrolling` on whatever is scrolling — the page's own
 * scroll lands on <html> — and clears it once that box has been still for HIDE_AFTER_MS.
 * globals.css keeps the thumb transparent unless the attribute is there.
 */
export function ScrollbarAutoHide() {
  useEffect(() => {
    const timers = new Map<Element, ReturnType<typeof setTimeout>>()

    // `scroll` doesn't bubble, but a capturing listener on document sees every element's.
    function on_scroll(e: Event) {
      const el = e.target instanceof Element ? e.target : document.documentElement
      if (!el.hasAttribute('data-scrolling')) el.setAttribute('data-scrolling', '')
      clearTimeout(timers.get(el))
      timers.set(
        el,
        setTimeout(() => {
          el.removeAttribute('data-scrolling')
          timers.delete(el)
        }, HIDE_AFTER_MS),
      )
    }

    document.addEventListener('scroll', on_scroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', on_scroll, { capture: true })
      timers.forEach(clearTimeout)
    }
  }, [])

  return null
}
