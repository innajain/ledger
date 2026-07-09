import { Prisma } from '@/generated/prisma/client'

export function toDecimal(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined) return null
  return new Prisma.Decimal(n)
}
