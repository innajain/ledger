import 'server-only'

/**
 * Takes the XIRR as a promise the page starts once (compute_xirr_for_accounts), so the
 * badge can appear in more than one place — beside the hero and on the allocations row —
 * without computing it more than once.
 */
export async function InvestXirrBadge({ xirr: pending }: { xirr: Promise<number | null> }) {
  const xirr = await pending
  if (xirr === null || xirr === undefined) return null

  return (
    <span className="ml-2 text-xs text-ink-3">
      XIRR <span className={`num ${xirr > 0 ? 'text-pos' : xirr < 0 ? 'text-neg' : ''}`}>{(xirr * 100).toFixed(1)}%</span>
    </span>
  )
}

export function InvestXirrBadgeFallback() {
  return <span className="ml-2 text-xs text-ink-3 animate-pulse">XIRR …</span>
}
