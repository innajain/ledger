import React from 'react'

export function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  // scroll-mt offsets the anchor jump so the heading doesn't hide under the sticky page header.
  return (
    <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1 scroll-mt-24">
      {children}
    </h2>
  )
}
