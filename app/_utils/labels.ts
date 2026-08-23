import type { asset_type } from '@/generated/prisma/enums'

/** Human-readable names for the raw `asset_type` enum values — never show the enum itself in UI. */
export const ASSET_TYPE_LABELS: Record<asset_type, string> = {
  rupees: 'Rupees',
  mf: 'Mutual fund',
  etf: 'ETF',
  shares: 'Shares',
  other: 'Other',
}

export function asset_type_label(type: string): string {
  return ASSET_TYPE_LABELS[type as asset_type] ?? type
}
