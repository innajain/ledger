import { asset_type, Prisma } from '@/generated/prisma/client'

// validates only qty and book value
export function validate_line_items(
  line_items: Prisma.transactionGetPayload<{
    include: {
      line_items: {
        select: {
          account: true
          asset: true
          quantity: true
          book_value: true
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

  for (const [asset_id, group] of assetwise_groups.entries()) {
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
      if ([...group.real, ...group.allocation, ...group.nominal].some(li => li.book_value != null))
        return {
          is_valid: false,
          message: `Line items for rupees asset should not have book value`,
        }
    } else {
      if (group.real.some(li => li.book_value == null))
        return {
          is_valid: false,
          message: `A real account line item for non-rupees asset ${group.name} has null book value.`,
        }
      if (group.allocation.length > 0 && group.allocation.filter(li => li.book_value === null).length !== 1)
        return {
          is_valid: false,
          message: `There should be exactly one line item with null book value in allocation accounts for non-rupees asset ${group.name}`,
        }
      if (group.nominal.length > 0 && group.nominal.filter(li => li.book_value === null).length !== 1)
        return {
          is_valid: false,
          message: `There should be exactly one line item with null book value in nominal accounts for non-rupees asset ${group.name}`,
        }
    }

    if (group.allocation.length === 0 || group.nominal.length === 0) {
      const real_qty_sum = group.real.reduce((acc, li) => acc.add(li.quantity!), new Prisma.Decimal(0))
      if (!real_qty_sum.equals(0))
        return {
          is_valid: false,
          message: `The sum of quantities in real accounts for asset ${group.name} should be zero when there are either no allocation or no nominal line items`,
        }
      if (group.asset_type !== asset_type.rupees) {
        const real_book_value_sum = group.real.reduce((acc, li) => acc.add(li.book_value ?? 0), new Prisma.Decimal(0))
        if (!real_book_value_sum.equals(0))
          return {
            is_valid: false,
            message: `The sum of book values in real accounts for asset ${group.name} should be zero when there are either no allocation or no nominal line items`,
          }
      }
    }
  }
  return { is_valid: true, message: 'All line items are valid' }
}

export function get_line_item_qty(
  li: Prisma.line_itemGetPayload<{
    include: {
      account: true
      asset: true
      transaction: { include: { line_items: { include: { account: true } } } }
    }
  }>,
) {
  if (li.quantity != null) return li.quantity
  const total_qty = li.transaction.line_items
    .filter(t_li => t_li.account.type === 'real' && t_li.asset_id === li.asset_id)
    .reduce((sum, t_li) => sum.add(t_li.quantity!), new Prisma.Decimal(0))

  const sum_qty = li.transaction.line_items
    .filter(t_li => t_li.account.type === li.account.type && t_li.asset_id === li.asset_id)
    .reduce((sum, t_li) => sum.add(t_li.quantity ?? 0), new Prisma.Decimal(0))

  return total_qty.sub(sum_qty)
}

export function get_line_item_book_value(
  li: Prisma.line_itemGetPayload<{
    include: {
      account: true
      asset: true
      transaction: {
        include: {
          line_items: {
            include: {
              account: true
              asset: true
              transaction: {
                include: { line_items: { include: { account: true } } }
              }
            }
          }
        }
      }
    }
  }>,
) {
  if (li.book_value != null) return li.book_value
  if (li.asset.type === asset_type.rupees) return get_line_item_qty(li)
  const total_book_value = li.transaction.line_items
    .filter(t_li => t_li.account.type === 'real' && t_li.asset_id === li.asset_id)
    .reduce((sum, t_li) => sum.add(t_li.book_value ?? t_li.quantity!), new Prisma.Decimal(0))

  const sum_book_value = li.transaction.line_items
    .filter(t_li => t_li.account.type === li.account.type && t_li.asset_id === li.asset_id)
    .reduce((sum, t_li) => sum.add(t_li.book_value ?? 0), new Prisma.Decimal(0))

  return total_book_value.sub(sum_book_value)
}
