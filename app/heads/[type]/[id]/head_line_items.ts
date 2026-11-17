import 'server-only'
import { prisma } from '@/lib/prisma'
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { asset_type, Prisma } from '@/generated/prisma/client'
import type { LineItem } from '@/app/_components/HeadDetailPage'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { head_detail_link } from '@/app/_utils/subtree_value'

/**
 * Exactly the columns this page reads. `include: { accounting_head: true, asset: true }`
 * hangs whole rows off every line item — lock_date, tax_treatment, order_index, parent
 * ids and the rest — which on a subtree with thousands of line items is megabytes of
 * duplicated columns pulled over the wire on every render. Measured on a 2,767-transaction
 * subtree: 6.1 MB against 3.4 MB. (The MCP route keeps its own `slim_txn_select` for the
 * same reason.)
 */
export const head_txn_select = {
  id: true,
  datetime: true,
  description: true,
  line_items: {
    select: {
      id: true,
      accounting_head_id: true,
      asset_id: true,
      quantity: true,
      txn_value: true,
      datetime: true,
      description: true,
      accounting_head: { select: { id: true, name: true, type: true } },
      asset: { select: { id: true, name: true, type: true, ticker: true } },
    },
  },
} satisfies Prisma.transactionSelect

/**
 * Every real (non-future) line item in scope with its values, newest first, plus the
 * totals summed along the way. The head page renders the first page of `line_items` and
 * the figures; the "Show more" action re-runs this and returns a later page, so both read
 * the rows the same way (FIFO remaining quantities need the whole list, not one page).
 */
export async function load_head_line_items({
  user_id,
  head_id,
  is_account,
  scoped_head_ids,
  scope,
}: {
  user_id: string
  head_id: string
  is_account: boolean
  scoped_head_ids: Set<string>
  scope: 'self' | 'subtree'
}) {
  const rawTransactions = await prisma.transaction.findMany({
    where: { user_id, ...NOT_FUTURE, line_items: { some: { accounting_head_id: { in: [...scoped_head_ids] } } } },
    select: head_txn_select,
  })

  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)

  // The line items in scope, rewired to their parent transaction — this head's own in
  // the default view, the whole subtree's in the "including sub-heads" one.
  const head_line_items = rawTransactions.flatMap(tx =>
    tx.line_items.filter(li => scoped_head_ids.has(li.accounting_head_id)).map(li => ({ ...li, transaction: tx })),
  )

  const uniqueAssets = Array.from(new Map(head_line_items.map(li => [li.asset.id, li.asset])).values())
  const priceByAsset = await get_prices_for_assets(uniqueAssets)

  let acc_total = new Prisma.Decimal(0)
  // Book value — what the transactions actually recorded, never marked to market. Summed
  // over every line item (not just the assets left in `map`), so a fully exited holding
  // still contributes its realized cost the way acc_total does.
  let book_total = new Prisma.Decimal(0)
  // The root head's own value, whatever the page is scoped to. Nothing in the details
  // card prints it — it is the basis for the things that settle against this head alone
  // (UPI, "you owe"), which a subtree total would overstate.
  let own_total = new Prisma.Decimal(0)
  const cashflows: { amount: number; when: Date }[] = []
  const map: Record<string, { asset_id: string; asset_name: string; total_qty: Prisma.Decimal; total_book: Prisma.Decimal; asset_type: asset_type }> =
    {}
  const lineItemsWithValues: (LineItem & { _sortDate: Date })[] = []
  // Decimal-precision copy of each line item's lot, for the FIFO pass below —
  // lineItemsWithValues has already been flattened to numbers for the client.
  const lots: { id: string; head_id: string; asset_id: string; asset_type: asset_type; qty: Prisma.Decimal; book: Prisma.Decimal; date: Date }[] = []

  for (const li of head_line_items) {
    const n = normalizedById.get(li.id)!
    const qty = n.quantity!
    const txn_value = n.txn_value!
    const asset = li.asset
    const priceDecimal = (priceByAsset.get(asset.id) ?? null) && new Prisma.Decimal(priceByAsset.get(asset.id)!.price)
    const current_value = compute_current_value(asset.type, qty, priceDecimal, txn_value)

    acc_total = acc_total.add(current_value)
    book_total = book_total.add(txn_value)
    if (li.accounting_head_id === head_id) own_total = own_total.add(current_value)
    cashflows.push({ amount: -txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime })

    if (!map[asset.id])
      map[asset.id] = {
        asset_id: asset.id,
        asset_name: asset.name,
        total_qty: new Prisma.Decimal(0),
        total_book: new Prisma.Decimal(0),
        asset_type: asset.type,
      }
    map[asset.id].total_qty = map[asset.id].total_qty.add(qty)
    map[asset.id].total_book = map[asset.id].total_book.add(txn_value)

    lineItemsWithValues.push({
      id: li.id,
      asset_id: asset.id,
      asset_name: asset.name,
      quantity: qty.toNumber(),
      txn_value: txn_value.toNumber(),
      current_value: current_value.toNumber(),
      transaction_id: li.transaction.id,
      transaction_date: li.datetime ? li.datetime.toISOString() : li.transaction.datetime.toISOString(),
      transaction_description: li.transaction.description,
      line_item_description: li.description,
      asset_type: asset.type,
      remaining_quantity: null,
      // Which head the line actually sits on. Only rendered in the subtree view, where a
      // row's own head is no longer implied by the page you are on.
      head_name: scope === 'subtree' ? li.accounting_head.name : null,
      head_link: scope === 'subtree' ? head_detail_link(li.accounting_head.type, li.accounting_head_id) : null,
      _sortDate: li.datetime ?? li.transaction.datetime,
    })
    lots.push({
      id: li.id,
      head_id: li.accounting_head_id,
      asset_id: asset.id,
      asset_type: asset.type,
      qty,
      book: txn_value,
      date: li.datetime ?? li.transaction.datetime,
    })
  }

  // FIFO one queue per head *and* asset: which buy lots are still open. Keying on the
  // head as well matters in the subtree view — units bought in one sub-account are not
  // the units sold from a sibling, and a shared queue would close the wrong lots. In the
  // default view every line shares one head, so the key is the asset as before. Feeds the
  // per-row remaining badge (accounts only, as before) and the invested total below.
  const remaining_by_id = compute_fifo_remaining(
    lots.filter(l => l.asset_type !== asset_type.rupees).map(l => ({ id: l.id, group_key: `${l.head_id}|${l.asset_id}`, qty: l.qty, date: l.date })),
  )

  if (is_account) {
    for (const li of lineItemsWithValues) {
      li.remaining_quantity = remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)!.toNumber() : null
    }
  }

  // Invested — the cost basis of what the head still holds, the same measure the asset
  // page calls "Current investment": open lots at their own purchase cost, prorated when
  // a lot is part-sold, plus rupees at face value (cash's cost basis is itself). It
  // parts ways with book value only once units are sold, because book keeps the
  // proceeds-vs-cost difference of the closed lots — a fully exited holding leaves its
  // realized gain sitting in book while contributing nothing here.
  let invested_total = new Prisma.Decimal(0)
  let holds_non_rupees = false
  for (const lot of lots) {
    if (lot.asset_type === asset_type.rupees) {
      invested_total = invested_total.add(lot.book)
      continue
    }
    holds_non_rupees = true
    if (!lot.qty.greaterThan(0)) continue
    const remaining = remaining_by_id.get(lot.id)
    if (remaining && remaining.greaterThan(0)) invested_total = invested_total.add(lot.book.mul(remaining).div(lot.qty))
  }

  lineItemsWithValues.sort((a, b) => b._sortDate.getTime() - a._sortDate.getTime())
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const line_items: LineItem[] = lineItemsWithValues.map(({ _sortDate, ...rest }) => rest)

  return { transactions, uniqueAssets, priceByAsset, acc_total, book_total, own_total, cashflows, map, invested_total, holds_non_rupees, line_items }
}
