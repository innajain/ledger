'use client'

import { Spinner } from './icons'

/**
 * Quiet page-level loading state. Skeletons (ListSkeleton/DetailSkeleton) are preferred
 * where the layout is known; this is the fallback for routes without one.
 */
export function FunLoader({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-100 gap-4" role="status" aria-live="polite">
      <Spinner className="animate-spin w-8 h-8 text-slate-400 dark:text-slate-500" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  )
}
