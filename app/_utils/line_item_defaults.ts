import type { LineItemDefaults } from '@/app/_actions/preferences'

type AccountLite = { id: string; name: string; type: string }
type AssetLite = { id: string; name: string }

export type AccountTypeKey = 'account' | 'allocation' | 'income_expense'

function preferredAccountId(defaults: LineItemDefaults, typeKey: AccountTypeKey): string | null {
  if (typeKey === 'account') return defaults.default_account_id
  if (typeKey === 'allocation') return defaults.default_allocation_id
  return defaults.default_income_expense_id
}

export function pickDefaultAccount<A extends AccountLite>(accounts: A[], defaults: LineItemDefaults, typeKey: AccountTypeKey): A | undefined {
  const preferredId = preferredAccountId(defaults, typeKey)
  const preferred = preferredId ? accounts.find(a => a.id === preferredId && a.type === typeKey) : undefined
  return preferred ?? accounts.find(a => a.type === typeKey) ?? accounts[0]
}

export function pickDefaultAsset<A extends AssetLite>(assets: A[], defaults: LineItemDefaults): A | undefined {
  if (defaults.default_asset_id) {
    const found = assets.find(a => a.id === defaults.default_asset_id)
    if (found) return found
  }
  return assets[0]
}
