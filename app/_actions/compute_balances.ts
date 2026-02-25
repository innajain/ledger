import { asset_type, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { redis } from '@/lib/redis'

export async function get_or_compute_balances(invalidate_cache = false) {
  if (!invalidate_cache && (await redis.exists('balances'))) {
    const cached = (await redis.get('balances'))!
    const balances = new Map<string, Map<string, { qty: number; book_value: number }>>(
      JSON.parse(cached).map(([k, v]: [string, [string, { qty: number; book_value: number }][]]) => [
        k,
        new Map(v.map(([k2, v2]) => [k2, { qty: v2.qty, book_value: v2.book_value }])),
      ]),
    )
    return balances
  }

  const transactions = await prisma.transaction.findMany({
    include: { line_items: { include: { account: true, asset: true } } },
  })
  for (const tx of transactions) {
    normalize_txn(tx)
  }
  //   account, asset, qty and asset, account, qty
  const balances = new Map<string, Map<string, { qty: Prisma.Decimal; book_value: Prisma.Decimal }>>()

  for (const tx of transactions) {
    for (const li of tx.line_items) {
      const acc_id = li.account_id
      const asset_id = li.asset_id
      const qty = li.quantity!
      const book_value = li.book_value!

      if (!balances.has(acc_id)) balances.set(acc_id, new Map())
      const assetMap = balances.get(acc_id)!
      if (!assetMap.has(asset_id)) assetMap.set(asset_id, { qty, book_value })
      else {
        const existing = assetMap.get(asset_id)!
        assetMap.set(asset_id, { qty: existing.qty.add(qty), book_value: existing.book_value.add(book_value) })
      }

      if (!balances.has(asset_id)) balances.set(asset_id, new Map())
      const accMap = balances.get(asset_id)!
      if (!accMap.has(acc_id)) accMap.set(acc_id, { qty, book_value })
      else {
        const existing_acc = accMap.get(acc_id)!
        accMap.set(acc_id, { qty: existing_acc.qty.add(qty), book_value: existing_acc.book_value.add(book_value) })
      }
    }
  }

  redis.set(
    'balances',
    JSON.stringify(
      Array.from(balances.entries()).map(([k, v]) => [
        k,
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), book_value: v2.book_value.toNumber() }]),
      ]),
    ),
  )

  //   convert balances to Map<string, Map<string, number>> for easier consumption by client
  const balances_for_client = new Map<string, Map<string, { qty: number; book_value: number }>>()
  for (const [k, v] of balances.entries()) {
    balances_for_client.set(
      k,
      new Map<string, { qty: number; book_value: number }>(
        Array.from(v.entries()).map(([k2, v2]) => [k2, { qty: v2.qty.toNumber(), book_value: v2.book_value.toNumber() }]),
      ),
    )
  }
  return balances_for_client
}

function normalize_txn(txn: Prisma.transactionGetPayload<{ include: { line_items: { include: { account: true; asset: true } } } }>) {
  const assetwise_groups = new Map<
    string,
    {
      real: (typeof txn)['line_items'][0][]
      allocation: (typeof txn)['line_items'][0][]
      nominal: (typeof txn)['line_items'][0][]
      asset_type: asset_type
    }
  >()

  for (const li of txn.line_items) {
    const asset_id = li.asset_id
    if (!assetwise_groups.has(asset_id)) {
      assetwise_groups.set(asset_id, { real: [], allocation: [], nominal: [], asset_type: li.asset.type })
    }
    const group = assetwise_groups.get(asset_id)!
    group[li.account.type].push(li)
  }

  const assetwise_total = new Map<string, { total_qty: Prisma.Decimal; total_book_value: Prisma.Decimal }>()
  for (const [asset_id, group] of assetwise_groups.entries()) {
    let total_qty = new Prisma.Decimal(0)
    let total_book_value = new Prisma.Decimal(0)
    for (const li of group.real) {
      if (li.quantity === null) throw new Error('Real line item with null quantity')
      total_qty = total_qty.add(li.quantity)
      total_book_value = total_book_value.add(li.book_value ?? li.quantity) // book value can be null for rupees assets
    }

    assetwise_total.set(asset_id, { total_qty, total_book_value })
  }

  for (const [asset_id, group] of assetwise_groups.entries()) {
    if (group.allocation.length > 0) {
      const allocation_qty_sum = group.allocation.reduce((acc, li) => {
        return acc.add(li.quantity ?? new Prisma.Decimal(0))
      }, new Prisma.Decimal(0))
      const allocation_null_qty_li = group.allocation.find(li => li.quantity === null)
      if (!allocation_null_qty_li) throw new Error('Allocation group with no null quantity line item ' + txn.id)
      allocation_null_qty_li.quantity = assetwise_total.get(asset_id)!.total_qty.sub(allocation_qty_sum)
    }

    if (group.nominal.length > 0) {
      const nominal_qty_sum = group.nominal.reduce((acc, li) => {
        return acc.add(li.quantity ?? new Prisma.Decimal(0))
      }, new Prisma.Decimal(0))
      const nominal_null_qty_li = group.nominal.find(li => li.quantity === null)
      if (!nominal_null_qty_li) throw new Error('Nominal group with no null quantity line item')
      nominal_null_qty_li.quantity = assetwise_total.get(asset_id)!.total_qty.sub(nominal_qty_sum)
    }

    if (group.asset_type === asset_type.rupees) {
      group.real.forEach(li => (li.book_value = li.quantity))
      group.allocation.forEach(li => (li.book_value = li.quantity))
      group.nominal.forEach(li => (li.book_value = li.quantity))
    } else {
      if (group.allocation.length > 0) {
        const allocation_book_value_sum = group.allocation.reduce((acc, li) => {
          return acc.add(li.book_value ?? new Prisma.Decimal(0))
        }, new Prisma.Decimal(0))
        const allocation_null_book_value_li = group.allocation.find(li => li.book_value === null)
        if (!allocation_null_book_value_li) throw new Error('Allocation group with no null book value line item for non-rupees asset')
        allocation_null_book_value_li.book_value = assetwise_total.get(asset_id)!.total_book_value.sub(allocation_book_value_sum)
      }

      if (group.nominal.length > 0) {
        const nominal_book_value_sum = group.nominal.reduce((acc, li) => {
          return acc.add(li.book_value ?? new Prisma.Decimal(0))
        }, new Prisma.Decimal(0))
        const nominal_null_book_value_li = group.nominal.find(li => li.book_value === null)
        if (!nominal_null_book_value_li) throw new Error('Nominal group with no null book value line item for non-rupees asset')
        nominal_null_book_value_li.book_value = assetwise_total.get(asset_id)!.total_book_value.sub(nominal_book_value_sum)
      }
    }
  }
}
