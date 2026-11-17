import 'server-only'
import { prisma } from '@/lib/prisma'
import { asset_type, Prisma } from '@/generated/prisma/client'
import type { AssetLineItem } from './ClientPage'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'

const asset_txn_include = { line_items: { include: { accounting_head: true, asset: true } } } satisfies Prisma.transactionInclude

type AssetTxn = Prisma.transactionGetPayload<{ include: typeof asset_txn_include }>

/** The caller's real (non-future) transactions that touch this asset. */
export function fetch_asset_transactions(user_id: string, asset_id: string): Promise<AssetTxn[]> {
  return prisma.transaction.findMany({
    where: { user_id, ...NOT_FUTURE, line_items: { some: { asset_id } } },
    include: asset_txn_include,
  })
}

/**
 * The asset's line items on account heads with their values and FIFO remaining
 * quantities, newest first, plus what the page sums from them. The asset page renders
 * the first page of `line_items`; the "Show more" action re-runs this and returns a later
 * page, so both read the rows the same way (FIFO needs the whole list, not one page).
 */
export function build_asset_line_items(asset: { id: string; type: asset_type }, rawTransactions: AssetTxn[], priceDecimal: Prisma.Decimal | null) {
  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  // The asset's own line items, rewired to their parent transaction — the same set the
  // old `asset.line_items` include produced, without fetching everything twice.
  const asset_line_items = rawTransactions.flatMap(tx => tx.line_items.filter(li => li.asset_id === asset.id).map(li => ({ ...li, transaction: tx })))

  const real_line_items = asset_line_items.filter(li => li.accounting_head.type === 'account')
  const allocation_line_items = asset_line_items.filter(li => li.accounting_head.type === 'allocation')

  const items_with_meta = real_line_items.map(li => {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const book = n.txn_value!
    return {
      li,
      qty,
      book,
      current_value: compute_current_value(asset.type, qty, priceDecimal, book),
      sortDate: li.datetime ?? li.transaction.datetime,
    }
  })

  const remaining_by_id =
    asset.type !== asset_type.rupees
      ? compute_fifo_remaining(
          items_with_meta.map(item => ({ id: item.li.id, group_key: item.li.accounting_head.id, qty: item.qty, date: item.sortDate })),
        )
      : new Map<string, Prisma.Decimal>()

  let current_investment = new Prisma.Decimal(0)
  for (const { li, qty, book } of items_with_meta) {
    if (qty.greaterThan(0)) {
      const remaining = remaining_by_id.get(li.id) ?? new Prisma.Decimal(0)
      if (remaining.greaterThan(0)) current_investment = current_investment.add(book.mul(remaining).div(qty))
    }
  }

  const line_items: AssetLineItem[] = items_with_meta
    .map(({ li, qty, book, current_value, sortDate }) => ({
      id: li.id,
      accounting_head_id: li.accounting_head.id,
      account_name: li.accounting_head.name,
      quantity: qty.toNumber(),
      txn_value: book.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
      remaining_quantity: remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null,
      _sortDate: sortDate,
    }))
    .sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ _sortDate, ...rest }) => rest)

  return { transactions, normalizedById, real_line_items, allocation_line_items, current_investment, line_items }
}
