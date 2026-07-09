import { useEffect, useState } from 'react'

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

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error }
}
