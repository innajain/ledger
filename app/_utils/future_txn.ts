import type { Prisma } from '@/generated/prisma/client'
import { ist_midnight, ist_ymd } from '@/app/_utils/ist_date'

// Shared "current, real transactions only" filter. Future transactions are
// created with is_future = true and are excluded from every value-producing
// read (balances, net worth, XIRR, FIFO, income/expense, timeseries, lists)
// until they are converted to real ones.
export const NOT_FUTURE = { is_future: false } satisfies Prisma.transactionWhereInput

// A future transaction dated on or before the end of today (IST) is due: its scheduled
// moment has arrived (or passed) and it is waiting to be converted to a real one. Same
// end-of-IST-day boundary the lock-date checks use, so "today" means the whole IST day,
// not just the part of it that has elapsed. Uses the dependency-free IST helpers rather
// than date.ts, since NOT_FUTURE above is imported widely.
export function is_future_txn_due(datetime: Date, now: Date = new Date()): boolean {
  const end_of_today = ist_midnight(ist_ymd(now)).getTime() + 24 * 60 * 60 * 1000
  return datetime.getTime() < end_of_today
}
