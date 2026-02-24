import { account, asset, asset_type, Prisma } from '@/generated/prisma/client'
import { CreateLineItemInput } from '../_actions/transactions'

// validates only qty and book value
export function validate_line_items(line_items: CreateLineItemInput[], accounts: account[], assets: asset[]) {
  // Build maps for account types
  const account_by_id = new Map(accounts.map(a => [a.id, a]))
  const asset_by_id = new Map(assets.map(a => [a.id, a]))

  // for allocation and nominal accounts, quantity must be null for exactly one line item per asset, similarly for book_value for non-rupees assets. and for rupees assets, book_value must be null
  // group line items by asset and account type, and check the above conditions
  const line_items_by_asset_and_acc_type = new Map<
    string,
    {
      real: CreateLineItemInput[]
      allocation: CreateLineItemInput[]
      nominal: CreateLineItemInput[]
    }
  >()
  line_items.forEach(li => {
    const acc_type = account_by_id.get(li.account_id)!.type
    if (!line_items_by_asset_and_acc_type.has(li.asset_id)) {
      line_items_by_asset_and_acc_type.set(li.asset_id, { real: [], allocation: [], nominal: [] })
    }
    line_items_by_asset_and_acc_type.get(li.asset_id)![acc_type].push(li)
  })

  for (const [asset_id, group] of line_items_by_asset_and_acc_type.entries()) {
    const asset = asset_by_id.get(asset_id)!

    const real_qty_null_count = group.real.filter(li => li.quantity == null).length
    if (real_qty_null_count !== 0) {
      throw new Error(`Quantity must be specified for all line items in real accounts for asset "${asset.name}"`)
    }
    const alloc_qty_null_count = group.allocation.filter(li => li.quantity == null).length
    if (group.allocation.length > 0 && alloc_qty_null_count !== 1) {
      throw new Error(`Exactly one line item in allocation accounts must have null quantity for asset "${asset.name}"`)
    }
    const nominal_qty_null_count = group.nominal.filter(li => li.quantity == null).length
    if (group.nominal.length > 0 && nominal_qty_null_count !== 1) {
      throw new Error(`Exactly one line item in nominal accounts must have null quantity for asset "${asset.name}"`)
    }

    if (asset.type === asset_type.rupees) {
      ;[...group.real, ...group.allocation, ...group.nominal].forEach(li => {
        if (li.book_value != null) {
          throw new Error(`Book value must not be specified for currency asset "${asset.name}" (quantity is the value)`)
        }
      })
    } else {
      const real_book_value_null_count = group.real.filter(li => li.book_value == null).length
      if (real_book_value_null_count !== 0) {
        throw new Error(`Book value must be specified for all line items in real accounts for non-currency asset "${asset.name}"`)
      }
      const alloc_book_value_null_count = group.allocation.filter(li => li.book_value == null).length
      if (group.allocation.length > 0 && alloc_book_value_null_count !== 1) {
        throw new Error(`Exactly one line item in allocation accounts must have null book value for non-currency asset "${asset.name}"`)
      }
      const nominal_book_value_null_count = group.nominal.filter(li => li.book_value == null).length
      if (group.nominal.length > 0 && nominal_book_value_null_count !== 1) {
        throw new Error(`Exactly one line item in nominal accounts must have null book value for non-currency asset "${asset.name}"`)
      }
    }
  }
}

export function convert_to_normal_line_items(
  line_items: Prisma.line_itemGetPayload<{
    include: { account: true; asset: true }
  }>[],
) {
  const assetwise_acc_typewise_line_items = new Map<
    string,
    {
      real: Prisma.line_itemGetPayload<{ include: { account: true; asset: true } }>[]
      allocation: Prisma.line_itemGetPayload<{ include: { account: true; asset: true } }>[]
      nominal: Prisma.line_itemGetPayload<{ include: { account: true; asset: true } }>[]
    }
  >()

  line_items.forEach(li => {
    const acc_type = li.account.type
    if (!assetwise_acc_typewise_line_items.has(li.asset.id)) {
      assetwise_acc_typewise_line_items.set(li.asset.id, { real: [], allocation: [], nominal: [] })
    }
    assetwise_acc_typewise_line_items.get(li.asset.id)![acc_type].push(li)
  })

  const assetwise_total_qty_and_book_value = new Map<
    string,
    {
      quantity: Prisma.Decimal
      book_value: Prisma.Decimal | null
    }
  >()

  assetwise_acc_typewise_line_items.forEach((group, asset_id) => {
    const this_asset_type = (group.real[0] || group.allocation[0] || group.nominal[0]).asset.type
    const total_qty = group.real.reduce((sum, li) => sum.add(li.quantity!), new Prisma.Decimal(0))
    const total_book_value =
      this_asset_type === asset_type.rupees ? null : group.real.reduce((sum, li) => sum.add(li.book_value!), new Prisma.Decimal(0))

    assetwise_total_qty_and_book_value.set(asset_id, { quantity: total_qty, book_value: total_book_value })
  })

  assetwise_acc_typewise_line_items.forEach((group, asset_id) => {
    const this_asset_type = (group.real[0] || group.allocation[0] || group.nominal[0]).asset.type
    const total = assetwise_total_qty_and_book_value.get(asset_id)!
    const allocation_qty_sum = group.allocation.reduce((sum, li) => sum.add(li.quantity ?? 0), new Prisma.Decimal(0))
    const nominal_qty_sum = group.nominal.reduce((sum, li) => sum.add(li.quantity ?? 0), new Prisma.Decimal(0))
    const allocation_remaining_qty = total.quantity.sub(allocation_qty_sum)
    if (group.allocation.filter(li => li.quantity == null).length !== 1) {
      throw new Error(
        `${group.allocation[0].transaction_id} Internal error: there should be exactly one line item with null quantity in allocation accounts for asset id ${asset_id} but found ${group.allocation.filter(li => li.quantity == null).length}`,
      )
    }
    group.allocation.find(li => li.quantity == null)!.quantity = allocation_remaining_qty

    const nominal_remaining_qty = total.quantity.sub(nominal_qty_sum)
    if (group.nominal.filter(li => li.quantity == null).length !== 1) {
      throw new Error(
        `Internal error: there should be exactly one line item with null quantity in nominal accounts for asset id ${asset_id} but found ${group.nominal.filter(li => li.quantity == null).length}`,
      )
    }
    group.nominal.find(li => li.quantity == null)!.quantity = nominal_remaining_qty
    if (this_asset_type !== asset_type.rupees) {
      const allocation_book_value_sum = group.allocation.reduce((sum, li) => sum.add(li.book_value ?? 0), new Prisma.Decimal(0))
      const nominal_book_value_sum = group.nominal.reduce((sum, li) => sum.add(li.book_value ?? 0), new Prisma.Decimal(0))

      const allocation_remaining_book_value = total.book_value!.sub(allocation_book_value_sum)
      if (group.allocation.filter(li => li.book_value == null).length !== 1) {
        throw new Error(
          `Internal error: there should be exactly one line item with null book value in allocation accounts for asset id ${asset_id} but found ${group.allocation.filter(li => li.book_value == null).length}`,
        )
      }
      group.allocation.find(li => li.book_value == null)!.book_value = allocation_remaining_book_value

      const nominal_remaining_book_value = total.book_value!.sub(nominal_book_value_sum)
      if (group.nominal.filter(li => li.book_value == null).length !== 1) {
        throw new Error(
          `Internal error: there should be exactly one line item with null book value in nominal accounts for asset id ${asset_id} but found ${group.nominal.filter(li => li.book_value == null).length}`,
        )
      }
      group.nominal.find(li => li.book_value == null)!.book_value = nominal_remaining_book_value
    }
  })
}

export function get_line_item_qty(
  li: Prisma.line_itemGetPayload<{
    include: { account: true; asset: true; transaction: { include: { line_items: { include: { account: true } } } } }
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
        include: { line_items: { include: { account: true; asset: true; transaction: { include: { line_items: { include: { account: true } } } } } } }
      }
    }
  }>,
) {
  if (li.book_value != null) return li.book_value
  const total_book_value = li.transaction.line_items
    .filter(t_li => t_li.account.type === 'real' && t_li.asset_id === li.asset_id)
    .reduce((sum, t_li) => sum.add(t_li.book_value ?? t_li.quantity!), new Prisma.Decimal(0))

  const this_asset_type = li.asset.type
  const sum_book_value = li.transaction.line_items
    .filter(t_li => t_li.account.type === li.account.type && t_li.asset_id === li.asset_id)
    .reduce((sum, t_li) => sum.add(this_asset_type === asset_type.rupees ? get_line_item_qty(t_li) : (t_li.book_value ?? 0)), new Prisma.Decimal(0))

  return total_book_value.sub(sum_book_value)
}
