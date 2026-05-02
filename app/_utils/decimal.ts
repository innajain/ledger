import { Prisma } from '@/generated/prisma/client'

/**
 * Convert a JS number (or null/undefined) into a Prisma.Decimal | null.
 * Use at the API boundary; downstream code should keep working in Decimal.
 */
export function toDecimal(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined) return null
  return new Prisma.Decimal(n)
}
