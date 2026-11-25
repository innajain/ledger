'use client'

import { ParamToggle } from '@/app/_components/ParamToggle'

export type HeadScopeValue = 'self' | 'subtree'

/**
 * Picks which heads the page reports on: this one alone, or it plus its descendants.
 * The choice lives in the `scope` search param — see ParamToggle for why. `fallback` is
 * the view the bare URL opens on, which is 'subtree' for a parent that holds nothing
 * itself (see default_scope in the head page).
 */
export function ScopeToggle({
  active,
  fallback = 'self',
  subEntityLabel,
}: {
  active: HeadScopeValue
  fallback?: HeadScopeValue
  subEntityLabel: string
}) {
  return (
    <ParamToggle<HeadScopeValue>
      param="scope"
      active={active}
      fallback={fallback}
      groupLabel="Which heads to include"
      leading="Showing"
      options={[
        { value: 'self', label: 'This one only' },
        { value: 'subtree', label: `With ${subEntityLabel}` },
      ]}
    />
  )
}
