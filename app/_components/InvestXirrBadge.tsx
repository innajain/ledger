import 'server-only'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'

type Props = {
  userId: string
  subtreeAccountIds: string[]
  currentValue: number
}

export async function InvestXirrBadge({ userId, subtreeAccountIds, currentValue }: Props) {
  if (subtreeAccountIds.length === 0 || currentValue === 0) return null

  const rawTransactions = await prisma.transaction.findMany({
    where: {
      user_id: userId,
      line_items: { some: { account_id: { in: subtreeAccountIds } } },
    },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  if (rawTransactions.length === 0) return null

  const subtreeIdSet = new Set(subtreeAccountIds)
  const cashflows: { amount: number; when: Date }[] = []
  for (const tx of rawTransactions.map(normalize_txn)) {
    for (const li of tx.line_items) {
      if (!subtreeIdSet.has(li.account_id)) continue
      cashflows.push({
        amount: -(li.txn_value as Prisma.Decimal).toNumber(),
        when: li.datetime ?? tx.datetime,
      })
    }
  }
  cashflows.push({ amount: currentValue, when: new Date() })
  const xirr = calculate_xirr(cashflows)
  if (xirr === null || xirr === undefined) return null

  return (
    <div className="flex flex-col items-end">
      <span className="text-xs text-blue-700 dark:text-blue-300 uppercase tracking-wide font-medium">XIRR</span>
      <span
        className={`text-lg font-bold ${
          xirr > 0 ? 'text-green-700 dark:text-green-400' : xirr < 0 ? 'text-red-700 dark:text-red-400' : 'text-blue-900 dark:text-blue-100'
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
      <span className="text-xs text-blue-700 dark:text-blue-300 uppercase tracking-wide font-medium">XIRR</span>
      <span className="text-lg font-bold text-blue-300 dark:text-blue-800">…</span>
    </div>
  )
}
