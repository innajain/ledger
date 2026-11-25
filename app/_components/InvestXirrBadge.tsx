import 'server-only'
import { compute_xirr_for_accounts } from '@/app/_core/valuation_core'

type Props = {
  userId: string
  subtreeAccountIds: string[]
  currentValue: number
}

export async function InvestXirrBadge({ userId, subtreeAccountIds, currentValue }: Props) {
  const xirr = await compute_xirr_for_accounts(userId, subtreeAccountIds, currentValue)
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
