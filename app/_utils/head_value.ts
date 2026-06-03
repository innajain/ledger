import { Prisma } from '@/generated/prisma/client'

export type AssetBalance = { qty: number; txn_value: number }

// Read-only price lookup keyed by asset id (the shape get_prices_for_assets
// returns). `null` means no price is available for that asset.
export type PriceLookup = ReadonlyMap<string, { price: number } | null>

/**
 * Value a single balance entry: priced assets use live price × qty; unpriced
 * assets (no ticker, type 'other') fall back to the recorded txn_value (book value).
 */
export function value_balance_entry(qty: number, txn_value: number, price: number | null): Prisma.Decimal {
  return price !== null ? new Prisma.Decimal(price).mul(qty) : new Prisma.Decimal(txn_value)
}

/**
 * Total value of one accounting head: sum each held asset valued at its own
 * market price (falling back to book value when no price is available).
 * `asset_qty_map` is keyed by asset id, as produced by get_or_compute_balances.
 */
export function compute_head_value(asset_qty_map: Map<string, AssetBalance>, priceByAsset: PriceLookup): Prisma.Decimal {
  let total = new Prisma.Decimal(0)
  for (const [asset_id, { qty, txn_value }] of asset_qty_map) {
    total = total.add(value_balance_entry(qty, txn_value, priceByAsset.get(asset_id)?.price ?? null))
  }
  return total
}
