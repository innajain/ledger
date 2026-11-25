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
    <div className="flex flex-col items-end">
      <span className="text-xs text-ink-3 uppercase tracking-wide font-medium">XIRR</span>
      <span className={`text-lg font-bold ${xirr > 0 ? 'text-pos' : xirr < 0 ? 'text-neg' : 'text-ink-3'}`}>{(xirr * 100).toFixed(2)}%</span>
    </div>
  )
}

export function InvestXirrBadgeFallback() {
  return (
    <div className="flex flex-col items-end animate-pulse">
      <span className="text-xs text-ink-3 uppercase tracking-wide font-medium">XIRR</span>
      <span className="text-lg font-bold text-ink-3">…</span>
    </div>
  )
}
