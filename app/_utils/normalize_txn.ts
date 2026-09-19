import { Prisma } from '@/generated/prisma/client'
import { asset_type, accounting_head_type } from '@/generated/prisma/enums'

export type TransactionFull = Prisma.transactionGetPayload<{
  include: { line_items: { include: { accounting_head: true; asset: true } } }
}>

export type NormalizedLineItem = TransactionFull['line_items'][number] & {
  quantity: Prisma.Decimal
  txn_value: Prisma.Decimal
}

export type NormalizedTransaction = Omit<TransactionFull, 'line_items'> & {
  line_items: NormalizedLineItem[]
}

export type NormalizableLineItem = {
  asset: { id: string; type: asset_type; name: string }
  accounting_head: { type: accounting_head_type }
  quantity: Prisma.Decimal | null
  txn_value: Prisma.Decimal | null
}

export function normalize_line_items<T extends NormalizableLineItem>(
  line_items: T[],
): (T & { quantity: Prisma.Decimal; txn_value: Prisma.Decimal })[] {
  type Group = { account: T[]; allocation: T[]; income_expense: T[]; asset_type: asset_type }
  const assetwise_groups = new Map<string, Group>()

  const copies = line_items.map(li => ({ ...li }))
  for (const li of copies) {
    if (!assetwise_groups.has(li.asset.id)) {
      assetwise_groups.set(li.asset.id, { account: [], allocation: [], income_expense: [], asset_type: li.asset.type })
    }
    assetwise_groups.get(li.asset.id)![li.accounting_head.type].push(li)
  }

  const assetwise_total = new Map<string, { total_qty: Prisma.Decimal; total_txn_value: Prisma.Decimal }>()
  for (const [asset_id, group] of assetwise_groups) {
    let total_qty = new Prisma.Decimal(0)
    let total_txn_value = new Prisma.Decimal(0)
    for (const li of group.account) {
      if (li.quantity === null) throw new Error('Account line item with null quantity')
      total_qty = total_qty.add(li.quantity)
      total_txn_value = total_txn_value.add(li.txn_value !== null ? li.txn_value : li.quantity)
    }
    assetwise_total.set(asset_id, { total_qty, total_txn_value })
  }

  for (const [asset_id, group] of assetwise_groups) {
    const totals = assetwise_total.get(asset_id)!

    if (group.allocation.length > 0) {
      const sum = group.allocation.reduce((acc, li) => acc.add(li.quantity ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
      const nullEntry = group.allocation.find(li => li.quantity === null)
      if (!nullEntry) throw new Error('Allocation group with no null quantity line item')
      nullEntry.quantity = totals.total_qty.sub(sum)
    }

    if (group.income_expense.length > 0) {
      const sum = group.income_expense.reduce((acc, li) => acc.add(li.quantity ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
      const nullEntry = group.income_expense.find(li => li.quantity === null)
      if (!nullEntry) throw new Error('Income/expense group with no null quantity line item')
      nullEntry.quantity = totals.total_qty.sub(sum)
    }

    if (group.asset_type === asset_type.rupees) {
      for (const li of [...group.account, ...group.allocation, ...group.income_expense]) li.txn_value = li.quantity
    } else {
      if (group.allocation.length > 0) {
        const sum = group.allocation.reduce((acc, li) => acc.add(li.txn_value ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
        const nullEntry = group.allocation.find(li => li.txn_value === null)
        if (!nullEntry) throw new Error('Allocation group with no null txn value line item for non-rupees asset')
        nullEntry.txn_value = totals.total_txn_value.sub(sum)
      }
      if (group.income_expense.length > 0) {
        const sum = group.income_expense.reduce((acc, li) => acc.add(li.txn_value ?? new Prisma.Decimal(0)), new Prisma.Decimal(0))
        const nullEntry = group.income_expense.find(li => li.txn_value === null)
        if (!nullEntry) throw new Error('Income/expense group with no null txn value line item for non-rupees asset')
        nullEntry.txn_value = totals.total_txn_value.sub(sum)
      }
    }
  }

  return copies as (T & { quantity: Prisma.Decimal; txn_value: Prisma.Decimal })[]
}

/** Anything with normalizable line items — the shape normalize_txn actually reads. */
export type NormalizableTransaction = { line_items: NormalizableLineItem[] }

/**
 * Structural rather than tied to TransactionFull, so a caller can `select` just the
 * columns it needs instead of pulling whole `accounting_head` and `asset` rows onto every
 * line item. On a busy subtree that is megabytes of duplicated columns over the wire.
 * The return type carries the caller's own fields through, so nothing downstream loses
 * type information by fetching less.
 */
export function normalize_txn<T extends NormalizableTransaction>(
  txn: T,
): Omit<T, 'line_items'> & { line_items: (T['line_items'][number] & { quantity: Prisma.Decimal; txn_value: Prisma.Decimal })[] } {
  return { ...txn, line_items: normalize_line_items(txn.line_items) }
}
