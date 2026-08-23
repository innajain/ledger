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
      <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">XIRR</span>
      <span
        className={`text-lg font-bold ${
          xirr > 0 ? 'text-green-600 dark:text-green-400' : xirr < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {(xirr * 100).toFixed(2)}%
      </span>
    </div>
  )
}

export function InvestXirrBadgeFallback() {
  return (
    <div className="flex flex-col items-end animate-pulse">
      <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">XIRR</span>
      <span className="text-lg font-bold text-slate-300 dark:text-slate-600">…</span>
    </div>
  )
}
