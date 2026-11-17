'use client'

import { useState } from 'react'
import type { ActionResult } from '@/app/_actions/_result'

type Loaded<T> = { first: T[]; rows: T[]; exhausted: boolean }

/**
 * A list that arrives with its first page and fetches the rest on demand.
 *
 * `first` is the page the server rendered and `total` the full row count. Rows fetched
 * later are tied to the `first` they continue: a refresh brings a new first page and the
 * old extra rows are dropped, so the list never mixes two renders. Rows are de-duplicated
 * by id, so a row that shifted down a page between requests is not shown twice.
 */
export function useMoreItems<T extends { id: string }>(first: T[], total: number, load: (offset: number) => Promise<ActionResult<T[]>>) {
  const [loaded, setLoaded] = useState<Loaded<T>>({ first, rows: [], exhausted: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = loaded.first === first ? loaded : { first, rows: [], exhausted: false }
  const seen = new Set(first.map(r => r.id))
  const items = [...first]
  for (const r of current.rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    items.push(r)
  }
  const remaining = current.exhausted ? 0 : Math.max(0, total - items.length)

  async function showMore() {
    if (loading || remaining === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await load(items.length)
      if (!res.success) {
        setError(res.message)
        return
      }
      const next = res.data ?? []
      setLoaded(prev => {
        const base = prev.first === first ? prev : { first, rows: [], exhausted: false }
        // An empty page while rows were still expected means the list shrank since the
        // first render; stop offering more rather than showing a button that does nothing.
        return { first, rows: [...base.rows, ...next], exhausted: next.length === 0 }
      })
    } catch {
      setError('Could not load more items. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return { items, total, remaining, loading, error, showMore }
}
