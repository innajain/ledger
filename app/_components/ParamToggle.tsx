'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Spinner } from '@/app/_components/icons'

const BASE =
  'relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-1.5'
const ACTIVE = 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
const IDLE = 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'

/**
 * Spinner for the link being navigated to. useLinkStatus only reports for the <Link>
 * it is rendered inside, which is why this is its own component rather than a flag on
 * the parent — the parent has several links and would not know which one is pending.
 */
function PendingDot() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  // `base()` in icons.tsx replaces the fallback classes wholesale, so animate-spin has
  // to be repeated here rather than inherited.
  return <Spinner className="animate-spin w-3.5 h-3.5 shrink-0" />
}

export type ToggleOption<T extends string> = { value: T; label: string }

/**
 * A segmented control whose state is a search param rather than component state — used
 * where the options are answers the *server* computes from different queries, so a link
 * the server can read is both cheaper (only the chosen one is ever computed) and
 * shareable.
 *
 * That server round trip is why each link carries its own pending spinner. A search-param
 * change on the same route segment is a soft navigation, so Next never renders the
 * route's loading.tsx: without this the old figures simply sit there, unchanged and with
 * the clicked button not even looking pressed, for as long as the render takes. Silence
 * reads as a dead button, and the reader clicks again.
 */
export function ParamToggle<T extends string>({
  param,
  active,
  fallback,
  options,
  groupLabel,
  leading,
}: {
  param: string
  active: T
  /** The value expressed by the param's absence — no ?param=<default> twin of every bare URL. */
  fallback: T
  options: ToggleOption<T>[]
  groupLabel: string
  leading?: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function href(value: T): string {
    const params = new URLSearchParams(searchParams.toString())
    if (value === fallback) params.delete(param)
    else params.set(param, value)
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {leading && <span className="text-sm text-slate-500 dark:text-slate-400">{leading}</span>}
      <div role="group" aria-label={groupLabel} className="inline-flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
        {options.map(o => (
          // scroll={false} keeps the reader where they were — the page they are reading is
          // the thing being re-scoped, not a new destination.
          <Link
            key={o.value}
            href={href(o.value)}
            scroll={false}
            aria-current={o.value === active ? 'true' : undefined}
            className={`${BASE} ${o.value === active ? ACTIVE : IDLE}`}
          >
            {o.label}
            <PendingDot />
          </Link>
        ))}
      </div>
    </div>
  )
}
