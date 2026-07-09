import { Prisma } from '@/generated/prisma/client'

export type AssetBalance = { qty: number; txn_value: number }

export type PriceLookup = ReadonlyMap<string, { price: number } | null>

export function value_balance_entry(qty: number, txn_value: number, price: number | null): Prisma.Decimal {
  return price !== null ? new Prisma.Decimal(price).mul(qty) : new Prisma.Decimal(txn_value)
}

export function compute_head_value(asset_qty_map: Map<string, AssetBalance>, priceByAsset: PriceLookup): Prisma.Decimal {
  let total = new Prisma.Decimal(0)
  for (const [asset_id, { qty, txn_value }] of asset_qty_map) {
    total = total.add(value_balance_entry(qty, txn_value, priceByAsset.get(asset_id)?.price ?? null))
  }
  return total
}
