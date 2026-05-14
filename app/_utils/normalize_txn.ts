import { Prisma } from '@/generated/prisma/client'
import { asset_type, account_type } from '@/generated/prisma/enums'

/**
 * Raw transaction shape as fetched from Prisma — quantity and book_value
 * may be null on the allocation/nominal sides (and on book_value for rupees).
 */
export type TransactionFull = Prisma.transactionGetPayload<{
  include: { line_items: { include: { account: true; asset: true } } }
}>

/**
 * A transaction whose line items have been normalized: every quantity is
 * non-null, and every book_value is non-null. This is what callers should
 * reason about; only the storage layer sees the raw form.
 */
export type NormalizedLineItem = TransactionFull['line_items'][number] & {
  quantity: Prisma.Decimal
  book_value: Prisma.Decimal
}

export type NormalizedTransaction = Omit<TransactionFull, 'line_items'> & {
  line_items: NormalizedLineItem[]
}

export type NormalizableLineItem = {
  asset: { id: string; type: asset_type; name: string }
  account: { type: account_type }
  quantity: Prisma.Decimal | null
  book_value: Prisma.Decimal | null
}

/**
 * Pure: fills null quantity / book_value on copies of the provided line items
 * per the triple-entry invariants. The original items are not mutated.
 */
export function normalize_line_items<T extends NormalizableLineItem>(
  line_items: T[],
): (T & { quantity: Prisma.Decimal; book_value: Prisma.Decimal })[] {
  type Group = { real: T[]; allocation: T[]; nominal: T[]; asset_type: asset_type }
  const assetwise_groups = new Map<string, Group>()

  const copies = line_items.map(li => ({ ...li }))
  for (const li of copies) {
    if (!assetwise_groups.has(li.asset.id)) {
      assetwise_groups.set(li.asset.id, { real: [], allocation: [], nominal: [], asset_type: li.asset.type })
    }
    assetwise_groups.get(li.asset.id)![li.account.type].push(li)
  }

  const assetwise_total = new Map<string, { total_qty: Prisma.Decimal; total_book_value: Prisma.Decimal }>()
  for (const [asset_id, group] of assetwise_groups) {
    let total_qty = new Prisma.Decimal(0)
    let total_book_value = new Prisma.Decimal(0)
    for (const li of group.real) {
      if (li.quantity === null) throw new Error('Real line item with null quantity')
      total_qty = total_qty.add(li.quantity)
      total_book_value = total_book_value.add(li.book_value !== null ? li.book_value : li.quantity)
    }
    assetwise_total.set(asset_id, { total_qty, total_book_value })
  }

  for (const [asset_id, group] of assetwise_groups) {
    const totals = assetwise_total.get(asset_id)!

    if (group.allocation.length > 0) {
      const sum = group.allocation.reduce((acc, li) => acc.add(li.quantity ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
      const nullEntry = group.allocation.find(li => li.quantity === null)
      if (!nullEntry) throw new Error('Allocation group with no null quantity line item')
      nullEntry.quantity = totals.total_qty.sub(sum)
    }

    if (group.nominal.length > 0) {
      const sum = group.nominal.reduce((acc, li) => acc.add(li.quantity ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
      const nullEntry = group.nominal.find(li => li.quantity === null)
      if (!nullEntry) throw new Error('Nominal group with no null quantity line item')
      nullEntry.quantity = totals.total_qty.sub(sum)
    }

    if (group.asset_type === asset_type.rupees) {
      for (const li of [...group.real, ...group.allocation, ...group.nominal]) li.book_value = li.quantity
    } else {
      if (group.allocation.length > 0) {
        const sum = group.allocation.reduce((acc, li) => acc.add(li.book_value ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
        const nullEntry = group.allocation.find(li => li.book_value === null)
        if (!nullEntry) throw new Error('Allocation group with no null book value line item for non-rupees asset')
        nullEntry.book_value = totals.total_book_value.sub(sum)
      }
      if (group.nominal.length > 0) {
        const sum = group.nominal.reduce((acc, li) => acc.add(li.book_value ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
        const nullEntry = group.nominal.find(li => li.book_value === null)
        if (!nullEntry) throw new Error('Nominal group with no null book value line item for non-rupees asset')
        nullEntry.book_value = totals.total_book_value.sub(sum)
      }
    }
  }

  return copies as (T & { quantity: Prisma.Decimal; book_value: Prisma.Decimal })[]
}

/**
 * Pure: returns a new transaction with all null quantity / book_value
 * filled per the triple-entry invariants. The input is not mutated.
 */
export function normalize_txn(txn: TransactionFull): NormalizedTransaction {
  return { ...txn, line_items: normalize_line_items(txn.line_items) as NormalizedLineItem[] }
}
