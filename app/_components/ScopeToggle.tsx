'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

export type HeadScopeValue = 'self' | 'subtree'

const BASE = 'px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
const ACTIVE = 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
const IDLE = 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'

/**
 * Picks which heads the page reports on: this one alone, or it plus its descendants.
 *
 * The choice lives in the `scope` search param rather than component state — the figures
 * it switches between are computed on the server from different queries, so a link the
 * server can read is both cheaper (only the chosen scope is ever computed) and shareable.
 * `scroll={false}` keeps the reader where they were, since the page they are reading is
 * the thing being re-scoped.
 */
export function ScopeToggle({ active, subEntityLabel }: { active: HeadScopeValue; subEntityLabel: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function href(scope: HeadScopeValue): string {
    const params = new URLSearchParams(searchParams.toString())
    // 'self' is the default, so it is expressed by the param's absence — no ?scope=self
    // twin of every bare head URL.
    if (scope === 'self') params.delete('scope')
    else params.set('scope', scope)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-slate-500 dark:text-slate-400">Showing</span>
      <div role="group" aria-label="Which heads to include" className="inline-flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
        <Link
          href={href('self')}
          scroll={false}
          aria-current={active === 'self' ? 'true' : undefined}
          className={`${BASE} ${active === 'self' ? ACTIVE : IDLE}`}
        >
          This one only
        </Link>
        <Link
          href={href('subtree')}
          scroll={false}
          aria-current={active === 'subtree' ? 'true' : undefined}
          className={`${BASE} ${active === 'subtree' ? ACTIVE : IDLE}`}
        >
          With {subEntityLabel}
        </Link>
      </div>
    </div>
  )
}
