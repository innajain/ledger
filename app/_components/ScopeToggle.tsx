'use client'

import type { ReactNode } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Spinner } from '@/app/_components/icons'

export type HeadScopeValue = 'self' | 'subtree'

const BASE =
  'relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-1.5'
const ACTIVE = 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
const IDLE = 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'

/**
 * Spinner for the scope link being navigated to. useLinkStatus only reports for the
 * <Link> it is rendered inside, which is why this is its own component rather than a
 * flag on the parent — the parent has two links and would not know which one is pending.
 */
function PendingDot() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  // `base()` in icons.tsx replaces the fallback classes wholesale, so animate-spin has
  // to be repeated here rather than inherited.
  return <Spinner className="animate-spin w-3.5 h-3.5 shrink-0" />
}

function ScopeLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    // scroll={false} keeps the reader where they were — the page they are reading is the
    // thing being re-scoped, not a new destination.
    <Link href={href} scroll={false} aria-current={current ? 'true' : undefined} className={`${BASE} ${current ? ACTIVE : IDLE}`}>
      {children}
      <PendingDot />
    </Link>
  )
}

/**
 * Picks which heads the page reports on: this one alone, or it plus its descendants.
 *
 * The choice lives in the `scope` search param rather than component state — the figures
 * it switches between are computed on the server from different queries, so a link the
 * server can read is both cheaper (only the chosen scope is ever computed) and shareable.
 *
 * That server round trip is why each link carries its own pending spinner. A search-param
 * change on the same route segment is a soft navigation, so Next never renders the
 * route's loading.tsx: without this the old figures simply sit there, unchanged and with
 * the clicked button not even looking pressed, for as long as the render takes. Silence
 * reads as a dead button, and the reader clicks again.
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
        <ScopeLink href={href('self')} current={active === 'self'}>
          This one only
        </ScopeLink>
        <ScopeLink href={href('subtree')} current={active === 'subtree'}>
          With {subEntityLabel}
        </ScopeLink>
      </div>
    </div>
  )
}
