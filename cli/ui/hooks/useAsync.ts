import { useEffect, useState } from 'react'

/**
 * Run an async loader on mount (and when `deps` change), exposing `data` /
 * `error` so screens render a real error instead of hanging on "Loading…"
 * forever when a query rejects. Ignores a resolved/rejected result after the
 * deps change or the component unmounts.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    load()
      .then(d => active && setData(d))
      .catch(e => active && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
    // load is intentionally excluded — deps fully describe when to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error }
}
