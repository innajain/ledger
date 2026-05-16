import { asset_type, Prisma } from '@/generated/prisma/client'
import { normalize_line_items } from './normalize_txn'

// validates only qty and txn value
export function validate_line_items(
  line_items: Prisma.transactionGetPayload<{
    include: {
      line_items: {
        select: {
          account: true
          asset: true
          quantity: true
          txn_value: true
        }
      }
    }
  }>['line_items'],
) {
  const assetwise_groups = new Map<
    string,
    {
      real: typeof line_items
      allocation: typeof line_items
      nominal: typeof line_items
      asset_type: asset_type
      name: string
    }
  >()

  for (const li of line_items) {
    const asset_id = li.asset.id
    if (!assetwise_groups.has(asset_id)) {
      assetwise_groups.set(asset_id, {
        real: [],
        allocation: [],
        nominal: [],
        asset_type: li.asset.type,
        name: li.asset.name,
      })
    }
    const group = assetwise_groups.get(asset_id)!
    group[li.account.type].push(li)
  }

  for (const group of assetwise_groups.values()) {
    if (group.real.some(li => li.quantity === null))
      return {
        is_valid: false,
        message: `A real account line item for asset ${group.name} has null quantity.`,
      }
    if (group.allocation.length > 0 && group.allocation.filter(li => li.quantity === null).length !== 1)
      return {
        is_valid: false,
        message: `There should be exactly one line item with null quantity in allocation accounts for asset ${group.name}`,
      }
    if (group.nominal.length > 0 && group.nominal.filter(li => li.quantity === null).length !== 1)
      return {
        is_valid: false,
        message: `There should be exactly one line item with null quantity in nominal accounts for asset ${group.name}`,
      }

    if (group.asset_type === asset_type.rupees) {
      if ([...group.real, ...group.allocation, ...group.nominal].some(li => li.txn_value != null))
        return {
          is_valid: false,
          message: `Line items for rupees asset should not have txn value`,
        }
    } else {
      if (group.real.some(li => li.txn_value == null))
        return {
          is_valid: false,
          message: `A real account line item for non-rupees asset ${group.name} has null txn value.`,
        }
      if (group.allocation.length > 0 && group.allocation.filter(li => li.txn_value === null).length !== 1)
        return {
          is_valid: false,
          message: `There should be exactly one line item with null txn value in allocation accounts for non-rupees asset ${group.name}`,
        }
      if (group.nominal.length > 0 && group.nominal.filter(li => li.txn_value === null).length !== 1)
        return {
          is_valid: false,
          message: `There should be exactly one line item with null txn value in nominal accounts for non-rupees asset ${group.name}`,
        }
    }

    const real_qty_sum = group.real.reduce((acc, li) => acc.add(li.quantity!), new Prisma.Decimal(0))

    if (group.allocation.length === 0 || group.nominal.length === 0) {
      if (!real_qty_sum.equals(0))
        return {
          is_valid: false,
          message: `The sum of quantities in real accounts for asset ${group.name} should be zero when there are either no allocation or no nominal line items`,
        }
      if (group.asset_type !== asset_type.rupees) {
        const real_txn_value_sum = group.real.reduce((acc, li) => acc.add(li.txn_value ?? 0), new Prisma.Decimal(0))
        if (!real_txn_value_sum.equals(0))
          return {
            is_valid: false,
            message: `The sum of txn values in real accounts for asset ${group.name} should be zero when there are either no allocation or no nominal line items`,
          }
      }
    }
  }

  // Fill inferred quantities then reject any that resolved to zero.
  const normalized = normalize_line_items(line_items)
  const zeroItem = normalized.find(li => li.quantity.equals(0))
  if (zeroItem)
    return {
      is_valid: false,
      message: `A line item for asset ${zeroItem.asset.name} and account ${zeroItem.account.type} has a zero quantity`,
    }
  return { is_valid: true, message: 'All line items are valid' }
}
