import { asset_type, Prisma } from '@/generated/prisma/client'
import { normalize_line_items } from './normalize_txn'

export function validate_line_items(
  line_items: Prisma.transactionGetPayload<{
    include: {
      line_items: {
        select: {
          accounting_head: true
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
      account: typeof line_items
      allocation: typeof line_items
      income_expense: typeof line_items
      asset_type: asset_type
      name: string
    }
  >()

  for (const li of line_items) {
    const asset_id = li.asset.id
    if (!assetwise_groups.has(asset_id)) {
      assetwise_groups.set(asset_id, {
        account: [],
        allocation: [],
        income_expense: [],
        asset_type: li.asset.type,
        name: li.asset.name,
      })
    }
    const group = assetwise_groups.get(asset_id)!
    group[li.accounting_head.type].push(li)
  }

  for (const group of assetwise_groups.values()) {
    if (group.account.some(li => li.quantity === null))
      return {
        is_valid: false,
        message: `An account line item for asset ${group.name} has null quantity.`,
      }
    if (group.allocation.length > 0 && group.allocation.filter(li => li.quantity === null).length !== 1)
      return {
        is_valid: false,
        message: `There should be exactly one line item with null quantity in allocation accounting heads for asset ${group.name}`,
      }
    if (group.income_expense.length > 0 && group.income_expense.filter(li => li.quantity === null).length !== 1)
      return {
        is_valid: false,
        message: `There should be exactly one line item with null quantity in income/expense accounting heads for asset ${group.name}`,
      }

    if (group.asset_type === asset_type.rupees) {
      if ([...group.account, ...group.allocation, ...group.income_expense].some(li => li.txn_value != null))
        return {
          is_valid: false,
          message: `Line items for rupees asset should not have txn value`,
        }
    } else {
      if (group.account.some(li => li.txn_value == null))
        return {
          is_valid: false,
          message: `An account line item for non-rupees asset ${group.name} has null txn value.`,
        }
      if (group.allocation.length > 0 && group.allocation.filter(li => li.txn_value === null).length !== 1)
        return {
          is_valid: false,
          message: `There should be exactly one line item with null txn value in allocation accounting heads for non-rupees asset ${group.name}`,
        }
      if (group.income_expense.length > 0 && group.income_expense.filter(li => li.txn_value === null).length !== 1)
        return {
          is_valid: false,
          message: `There should be exactly one line item with null txn value in income/expense accounting heads for non-rupees asset ${group.name}`,
        }
    }

    const account_qty_sum = group.account.reduce((acc, li) => acc.add(li.quantity!), new Prisma.Decimal(0))

    if (group.allocation.length === 0 || group.income_expense.length === 0) {
      if (!account_qty_sum.equals(0))
        return {
          is_valid: false,
          message: `The sum of quantities in account-type heads for asset ${group.name} should be zero when there are either no allocation or no income/expense line items`,
        }
      if (group.asset_type !== asset_type.rupees) {
        const account_txn_value_sum = group.account.reduce((acc, li) => acc.add(li.txn_value ?? 0), new Prisma.Decimal(0))
        if (!account_txn_value_sum.equals(0))
          return {
            is_valid: false,
            message: `The sum of txn values in account-type heads for asset ${group.name} should be zero when there are either no allocation or no income/expense line items`,
          }
      }
    }
  }

  const normalized = normalize_line_items(line_items)
  const zeroItem = normalized.find(li => li.quantity.equals(0))
  if (zeroItem)
    return {
      is_valid: false,
      message: `A line item for asset ${zeroItem.asset.name} and account ${zeroItem.accounting_head.type} has a zero quantity`,
    }
  return { is_valid: true, message: 'All line items are valid' }
}
