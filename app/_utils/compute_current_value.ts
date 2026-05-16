import { asset_type, Prisma } from '@/generated/prisma/client'

export function compute_current_value(
  type: asset_type,
  qty: Prisma.Decimal,
  price: Prisma.Decimal | null,
  txn_value: Prisma.Decimal,
): Prisma.Decimal {
  if (type === asset_type.rupees) return qty
  if (price) return price.mul(qty)
  return txn_value
}
