import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * A home-page section heading: serif title on a strong rule, with an optional link to the
 * full page. The home sections sit in a two-column grid, so they carry their own rule
 * rather than the overhanging `sheet` one, whose margins would collide across the gap.
 */
export function HomeSectionHead({
  title,
  href,
  linkLabel = 'View all',
  extra,
}: {
  title: string
  href?: string
  linkLabel?: string
  extra?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-rule-strong">
      <div className="flex items-baseline gap-2 min-w-0">
        <h2 className="text-xl font-medium text-ink">{title}</h2>
        {extra}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-sm font-medium text-accent hover:underline whitespace-nowrap">
          {linkLabel} →
        </Link>
      )}
    </div>
  )
}

/** One row of a home list: on a hairline, with a hover wash that reaches just past the text. */
export const HOME_ROW = 'relative -mx-2 px-2 border-b border-rule hover:bg-sunken transition-colors'

/** The day/kind tags beside a row's time — the paper version of a coloured pill. */
export const HOME_TAG = 'shrink-0 text-[11px] font-medium uppercase tracking-wide px-1.5 py-px rounded-sm border'
