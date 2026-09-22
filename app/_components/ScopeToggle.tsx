'use client'

import { ParamToggle } from '@/app/_components/ParamToggle'

export type HeadScopeValue = 'self' | 'subtree'

/**
 * Picks which heads the page reports on: this one alone, or it plus its descendants.
 * The choice lives in the `scope` search param — see ParamToggle for why.
 */
export function ScopeToggle({ active, subEntityLabel }: { active: HeadScopeValue; subEntityLabel: string }) {
  return (
    <ParamToggle<HeadScopeValue>
      param="scope"
      active={active}
      fallback="self"
      groupLabel="Which heads to include"
      leading="Showing"
      options={[
        { value: 'self', label: 'This one only' },
        { value: 'subtree', label: `With ${subEntityLabel}` },
      ]}
    />
  )
}
