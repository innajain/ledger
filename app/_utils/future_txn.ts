import type { Prisma } from '@/generated/prisma/client'

// Shared "current, real transactions only" filter. Future transactions are
// created with is_future = true and are excluded from every value-producing
// read (balances, net worth, XIRR, FIFO, income/expense, timeseries, lists)
// until they are converted to real ones.
export const NOT_FUTURE = { is_future: false } satisfies Prisma.transactionWhereInput
