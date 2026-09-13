import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Prisma, asset_type } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolve_access_token } from '@/lib/mcp/oauth'
import { compute_net_worth, subtree_total, compute_xirr_for_accounts } from '@/app/_core/valuation_core'
import { compute_balances_core, closing_balance_core } from '@/app/_core/balances_core'
import {
  create_transaction_core,
  update_transaction_core,
  delete_transaction_core,
  create_upi_payment_core,
  convert_future_transaction_core,
  type CreateLineItemInput,
} from '@/app/_core/transactions_core'
import { approve_request_core, reject_request_core } from '@/app/_core/approvals_core'
import { get_inbox, get_outbox } from '@/app/_utils/links'
import { get_prices_for_assets, get_price_for_asset } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_head_value, value_balance_entry } from '@/app/_utils/head_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { get_subtree_head_ids, compute_subtree_total } from '@/app/_utils/subtree_value'
import { normalize_txn, normalize_line_items } from '@/app/_utils/normalize_txn'
import { compute_future_sufficiency } from '@/app/_utils/future_balance'
import { NOT_FUTURE } from '@/app/_utils/future_txn'
import { get_indian_date_from_date_obj } from '@/app/_utils/date'
import {
  type ToolExtra,
  get_uid,
  text,
  error_text,
  action_result,
  load_heads,
  load_assets,
  resolve_ref,
  net_account_flow,
  parse_date,
  parse_day,
  lineItemShape,
  build_line_items,
  stored_lines_to_input,
  find_possible_duplicate,
  account_balances_for,
  dry_run_check,
} from './_helpers'
import { register_extra_tools } from './_extra_tools'

async function head_rollup(
  uid: string,
  root_id: string,
  preloaded_heads?: { id: string; parent_id: string | null; name: string }[],
): Promise<{ subtree_total: number | null; children: { name: string; total: number }[] }> {
  const [all_heads, { accountsToAssets: balances }] = await Promise.all([
    preloaded_heads ?? prisma.accounting_head.findMany({ where: { user_id: uid }, select: { id: true, parent_id: true, name: true } }),
    compute_balances_core(uid),
  ])
  const subtree_ids = get_subtree_head_ids(root_id, all_heads)
  if (subtree_ids.size <= 1) return { subtree_total: null, children: [] }
  const subtree_asset_ids = new Set<string>()
  for (const head_id of subtree_ids) for (const asset_id of balances.get(head_id)?.keys() ?? []) subtree_asset_ids.add(asset_id)
  const subtree_assets = await prisma.asset.findMany({
    where: { id: { in: [...subtree_asset_ids] } },
    select: { id: true, type: true, ticker: true },
  })
  const price_by_asset = await get_prices_for_assets(subtree_assets)
  const asset_type_by_id = new Map(subtree_assets.map(a => [a.id, a.type]))
  const subtree_total = compute_subtree_total(subtree_ids, balances, asset_type_by_id, price_by_asset).toNumber()
  const children = all_heads
    .filter(h => h.parent_id === root_id)
    .map(child => ({
      name: child.name,
      total: compute_subtree_total(get_subtree_head_ids(child.id, all_heads), balances, asset_type_by_id, price_by_asset).toNumber(),
    }))
    .sort((a, b) => b.total - a.total)
  return { subtree_total, children }
}

async function head_ids_of_txn(txn_id: string): Promise<string[]> {
  const lines = await prisma.line_item.findMany({ where: { transaction_id: txn_id }, select: { accounting_head_id: true } })
  return lines.map(l => l.accounting_head_id)
}

// Exactly the fields normalize_line_items and the tool outputs read — full
// accounting_head/asset rows would multiply the payload of the biggest queries.
const slim_txn_select = {
  id: true,
  datetime: true,
  description: true,
  is_future: true,
  line_items: {
    select: {
      id: true,
      accounting_head_id: true,
      asset_id: true,
      quantity: true,
      txn_value: true,
      description: true,
      datetime: true,
      accounting_head: { select: { name: true, type: true } },
      asset: { select: { id: true, type: true, name: true } },
    },
  },
} satisfies Prisma.transactionSelect

function register_tools(server: McpServer) {
  const base_register = server.registerTool.bind(server)
  server.registerTool = ((name: string, config: Parameters<typeof base_register>[1], handler: (...a: unknown[]) => unknown) =>
    base_register(
      name,
      config as never,
      (async (...a: unknown[]) => {
        try {
          return await handler(...a)
        } catch (err) {
          logger.error({ err, tool: name }, 'mcp tool failed')
          throw err
        }
      }) as never,
    )) as typeof server.registerTool

  const ro = { readOnlyHint: true } as const

  server.registerTool(
    'get_net_worth',
    {
      description:
        'Headline dashboard figures: total net worth, Investments current value + XIRR, and Savings current value. Pass include_allocations to also get the per-head allocation breakdown.',
      inputSchema: { include_allocations: z.boolean().optional().describe('Include the full allocation breakdown (default false)') },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const { networth, allocations } = await compute_net_worth(uid)
      const invest = subtree_total(allocations, 'Investments')
      const savings = subtree_total(allocations, 'Savings')
      const xirr = invest && invest.total !== 0 ? await compute_xirr_for_accounts(uid, invest.ids, invest.total) : null
      return text({
        net_worth: networth,
        investments: invest?.total ?? 0,
        investments_xirr: xirr,
        savings: savings?.total ?? 0,
        ...(args.include_allocations
          ? {
              allocations: allocations
                .filter(a => a.total !== 0)
                .map(a => ({ name: a.name, total: a.total }))
                .sort((a, b) => b.total - a.total),
            }
          : {}),
      })
    },
  )

  server.registerTool(
    'get_holdings',
    { description: 'Per-asset quantity, cost basis, live price, and current value.', inputSchema: {}, annotations: ro },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [{ assetsToAccounts }, assets] = await Promise.all([
        compute_balances_core(uid),
        prisma.asset.findMany({ select: { id: true, name: true, type: true, ticker: true } }),
      ])
      // Only user-held assets are ever valued below — an unheld cache-missed
      // ticker would otherwise trigger a blocking network price fetch.
      const priceByAsset = await get_prices_for_assets(assets.filter(a => assetsToAccounts.has(a.id)))
      const assetById = new Map(assets.map(a => [a.id, a]))
      let total = 0
      const holdings: Record<string, unknown>[] = []
      for (const [assetId, accMap] of assetsToAccounts) {
        const asset = assetById.get(assetId)
        if (!asset) continue
        let qty = 0
        let cost = 0
        for (const bal of accMap.values()) {
          qty += bal.qty
          cost += bal.txn_value
        }
        if (Math.abs(qty) < 1e-9) continue
        const priced = priceByAsset.get(assetId)
        const value = compute_current_value(
          asset.type,
          new Prisma.Decimal(qty),
          priced ? new Prisma.Decimal(priced.price) : null,
          new Prisma.Decimal(cost),
        ).toNumber()
        total += value
        holdings.push({ asset: asset.name, type: asset.type, ticker: asset.ticker, qty, cost, price: priced?.price ?? null, value })
      }
      holdings.sort((a, b) => (b.value as number) - (a.value as number))
      return text({ holdings, total })
    },
  )

  server.registerTool(
    'get_asset',
    {
      description:
        'Full detail for one asset (by id or name), mirroring its web page: type, ticker, live price, XIRR, parent/children, total current value, total book (txn) value, current investment (FIFO cost basis of remaining lots), and holdings aggregated by account and by allocation. Pass include_line_items for every account line (with FIFO remaining_quantity and the book value of that remainder); include_timeseries for the value-over-time series (priced assets only).',
      inputSchema: {
        asset: z.string().describe('Asset id or name'),
        include_line_items: z
          .boolean()
          .optional()
          .describe('Attach per-account line items with FIFO remaining (default false; newest first, paginated)'),
        include_timeseries: z.boolean().optional().describe('Attach the value-over-time series for priced assets (default false)'),
        from: z.string().optional().describe('With include_line_items: only lines on/after this day (dd-MM-yyyy or yyyy-MM-dd, IST)'),
        to: z.string().optional().describe('With include_line_items: only lines on/before this day (inclusive)'),
        line_items_limit: z.number().int().positive().max(1000).optional().describe('Max line items returned (default 200)'),
        line_items_offset: z.number().int().nonnegative().optional().describe('Skip this many line items (newest first)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const ref = resolve_ref(args.asset, await load_assets(), 'asset')
      const [asset, rawTransactions, priceResp] = await Promise.all([
        prisma.asset.findUnique({ where: { id: ref.id }, include: { parent: true, children: true } }),
        prisma.transaction.findMany({
          where: { user_id: uid, ...NOT_FUTURE, line_items: { some: { asset_id: ref.id } } },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        }),
        get_price_for_asset(ref.type, ref.ticker ?? null),
      ])
      if (!asset) return { content: [{ type: 'text', text: 'Asset not found' }], isError: true }
      const is_rupees = asset.type === asset_type.rupees

      const normalized_txns = rawTransactions.map(normalize_txn)
      const normalizedById = new Map<string, (typeof normalized_txns)[number]['line_items'][number]>()
      for (const tx of normalized_txns) for (const li of tx.line_items) normalizedById.set(li.id, li)
      const asset_line_items = rawTransactions.flatMap(tx =>
        tx.line_items.filter(li => li.asset_id === ref.id).map(li => ({ ...li, transaction: tx })),
      )
      const real_line_items = asset_line_items.filter(li => li.accounting_head.type === 'account')
      const allocation_line_items = asset_line_items.filter(li => li.accounting_head.type === 'allocation')
      const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null

      let asset_total = new Prisma.Decimal(0)
      let book_total = new Prisma.Decimal(0)
      const acc_map = new Map<string, { name: string; qty: Prisma.Decimal; book: Prisma.Decimal }>()
      for (const li of real_line_items) {
        const n = normalizedById.get(li.id)!
        const e = acc_map.get(li.accounting_head.id) ?? { name: li.accounting_head.name, qty: new Prisma.Decimal(0), book: new Prisma.Decimal(0) }
        e.qty = e.qty.add(n.quantity)
        e.book = e.book.add(n.txn_value)
        acc_map.set(li.accounting_head.id, e)
      }
      const by_account: { account: string; quantity: number; txn_value: number; current_value: number }[] = []
      for (const e of acc_map.values()) {
        book_total = book_total.add(e.book)
        if (e.qty.equals(0)) continue
        const cv = compute_current_value(asset.type, e.qty, priceDecimal, e.book)
        asset_total = asset_total.add(cv)
        by_account.push({ account: e.name, quantity: e.qty.toNumber(), txn_value: e.book.toNumber(), current_value: cv.toNumber() })
      }

      const alloc_map = new Map<string, { name: string; qty: Prisma.Decimal; book: Prisma.Decimal }>()
      for (const li of allocation_line_items) {
        const n = normalizedById.get(li.id)!
        const e = alloc_map.get(li.accounting_head.id) ?? { name: li.accounting_head.name, qty: new Prisma.Decimal(0), book: new Prisma.Decimal(0) }
        e.qty = e.qty.add(n.quantity)
        e.book = e.book.add(n.txn_value)
        alloc_map.set(li.accounting_head.id, e)
      }
      const by_allocation: { allocation: string; quantity: number; txn_value: number | null; current_value: number }[] = []
      for (const e of alloc_map.values()) {
        if (e.qty.equals(0)) continue
        const cv = compute_current_value(asset.type, e.qty, priceDecimal, e.book)
        by_allocation.push({
          allocation: e.name,
          quantity: e.qty.toNumber(),
          txn_value: is_rupees ? null : e.book.toNumber(),
          current_value: cv.toNumber(),
        })
      }

      const items = real_line_items.map(li => {
        const n = normalizedById.get(li.id)!
        return { li, qty: n.quantity, book: n.txn_value, sortDate: li.datetime ?? li.transaction.datetime }
      })
      const remaining_by_id = is_rupees
        ? new Map<string, Prisma.Decimal>()
        : compute_fifo_remaining(items.map(it => ({ id: it.li.id, group_key: it.li.accounting_head.id, qty: it.qty, date: it.sortDate })))
      let current_investment = new Prisma.Decimal(0)
      for (const { li, qty, book } of items) {
        if (!qty.greaterThan(0)) continue
        const rem = remaining_by_id.get(li.id) ?? new Prisma.Decimal(0)
        if (rem.greaterThan(0)) current_investment = current_investment.add(book.mul(rem).div(qty))
      }

      let xirr: number | null = null
      if (!is_rupees && real_line_items.length > 0) {
        const cashflows = real_line_items.map(li => ({
          amount: -normalizedById.get(li.id)!.txn_value.toNumber(),
          when: li.datetime ?? li.transaction.datetime,
        }))
        if (!asset_total.equals(0)) cashflows.push({ amount: asset_total.toNumber(), when: new Date() })
        xirr = calculate_xirr(cashflows)
      }

      const out: Record<string, unknown> = {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        ticker: asset.ticker,
        price: priceDecimal?.toNumber() ?? null,
        xirr,
        parent: asset.parent ? asset.parent.name : null,
        children: asset.children.map(c => c.name),
        total: asset_total.toNumber(),
        txn_value_total: is_rupees ? null : book_total.toNumber(),
        current_investment: is_rupees ? null : current_investment.toNumber(),
        by_account,
        by_allocation,
      }

      if (args.include_line_items) {
        const fromDate = args.from ? parse_day(args.from) : null
        let toDate: Date | null = null
        if (args.to) {
          toDate = parse_day(args.to)
          toDate.setDate(toDate.getDate() + 1)
        }
        const all_items = items
          .map(({ li, qty, book }) => {
            const rem = remaining_by_id.has(li.id) ? remaining_by_id.get(li.id)! : null
            return {
              transaction_id: li.transaction.id,
              datetime: li.datetime ?? li.transaction.datetime,
              account: li.accounting_head.name,
              description: li.description ?? li.transaction.description,
              quantity: qty.toNumber(),
              txn_value: book.toNumber(),
              current_value: compute_current_value(asset.type, qty, priceDecimal, book).toNumber(),
              remaining_quantity: rem ? rem.toNumber() : null,
              remaining_txn_value: rem && qty.greaterThan(0) ? book.mul(rem).div(qty).toNumber() : null,
            }
          })
          .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
          .filter(l => (!fromDate || l.datetime >= fromDate) && (!toDate || l.datetime < toDate))
        const offset = args.line_items_offset ?? 0
        const limit = args.line_items_limit ?? 200
        out.line_items_total = all_items.length
        if (offset > 0 || all_items.length > offset + limit)
          out.line_items_note = `showing ${Math.max(0, Math.min(limit, all_items.length - offset))} of ${all_items.length} — page with line_items_offset/line_items_limit or narrow with from/to`
        out.line_items = all_items.slice(offset, offset + limit)
      }

      if (args.include_timeseries && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
        // Bearer auth doesn't populate request context, so pass the authenticated uid
        // explicitly — without it MCP always bypassed the frozen timeseries cache.
        const series = await compute_value_timeseries(
          normalized_txns,
          { kind: 'asset', asset_id: asset.id },
          [{ id: asset.id, type: asset.type, ticker: asset.ticker }],
          uid,
        )
        reconcile_timeseries_tail(series, asset_total.toNumber(), xirr)
        out.value_timeseries = series
      }

      return text(out)
    },
  )

  server.registerTool(
    'get_balances',
    {
      description:
        'Per-account asset balances (quantity and book value). Optional head filter (id or name) and as_of date — as_of gives the closing balance at the END of that IST day (e.g. "Kotak at 30 Apr close" to check against a bank statement). With a head filter, as_of works for any head type, including allocations.',
      inputSchema: {
        head: z.string().optional().describe('Only this head (id or name); any type when combined with as_of, accounts otherwise'),
        as_of: z.string().optional().describe('dd-MM-yyyy or yyyy-MM-dd (IST) — closing balance at the END of that day; default: now'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [heads, assets] = await Promise.all([load_heads(uid), load_assets()])
      const filter_head = args.head ? resolve_ref(args.head, heads, 'accounting head') : null
      const headById = new Map(heads.map(h => [h.id, h]))
      const assetById = new Map(assets.map(a => [a.id, a]))
      const rows: Record<string, unknown>[] = []

      if (args.as_of) {
        const cutoff = parse_day(args.as_of)
        cutoff.setDate(cutoff.getDate() + 1)
        const closing = await closing_balance_core(uid, filter_head?.id ?? null, cutoff)
        for (const r of closing) {
          if (Math.abs(r.qty) < 1e-9 && Math.abs(r.value) < 1e-9 && !filter_head) continue
          rows.push({
            account: headById.get(r.head_id)?.name ?? r.head_id,
            asset: assetById.get(r.asset_id)?.name ?? r.asset_id,
            qty: r.qty,
            value: r.value,
          })
        }
        rows.sort((a, b) => String(a.account).localeCompare(String(b.account)))
        return text({ as_of: args.as_of, note: 'closing balance at end of that IST day; value is book value (not marked to market)', rows })
      }

      const { accountsToAssets } = await compute_balances_core(uid)
      for (const [headId, assetMap] of accountsToAssets) {
        const head = headById.get(headId)
        if (!head || head.type !== 'account') continue
        if (filter_head && head.id !== filter_head.id) continue
        for (const [assetId, bal] of assetMap) {
          if (Math.abs(bal.qty) < 1e-9 && Math.abs(bal.txn_value) < 1e-9 && !filter_head) continue
          rows.push({ account: head.name, asset: assetById.get(assetId)?.name ?? assetId, qty: bal.qty, value: bal.txn_value })
        }
      }
      rows.sort((a, b) => String(a.account).localeCompare(String(b.account)))
      return text(rows)
    },
  )

  server.registerTool(
    'get_head',
    {
      description:
        'Full detail for one accounting head (account / allocation / income_expense, by id or name), mirroring its web page: current value, subtree rollup total + immediate children, XIRR, parent, linked user (accounts), and holdings aggregated by asset. Pass include_line_items for every line touching the head (with FIFO remaining_quantity for accounts); include_timeseries for the value-over-time series (priced holdings only).',
      inputSchema: {
        head: z.string().describe('Accounting head id or name'),
        include_line_items: z.boolean().optional().describe('Attach line items touching the head (default false; newest first, paginated)'),
        include_timeseries: z.boolean().optional().describe('Attach the value-over-time series (default false)'),
        include_future_transactions: z
          .boolean()
          .optional()
          .describe(
            "Attach this head's future transactions (default false), each with its scheduled datetime, description, amount, and a sufficient flag — whether the head will have enough balance when it lands, computed cumulatively over all of them in datetime order (null if the transaction is already overdue, i.e. dated in the past, or touches nothing on this head)",
          ),
        from: z.string().optional().describe('With include_line_items: only lines on/after this day (dd-MM-yyyy or yyyy-MM-dd, IST)'),
        to: z.string().optional().describe('With include_line_items: only lines on/before this day (inclusive)'),
        line_items_limit: z.number().int().positive().max(1000).optional().describe('Max line items returned (default 200)'),
        line_items_offset: z.number().int().nonnegative().optional().describe('Skip this many line items (newest first)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const all_heads = await load_heads(uid)
      const ref = resolve_ref(args.head, all_heads, 'account')
      const head = await prisma.accounting_head.findFirst({ where: { id: ref.id, user_id: uid }, include: { parent: true } })
      if (!head) return { content: [{ type: 'text', text: 'Head not found' }], isError: true }
      const is_account = head.type === 'account'

      const [rawTransactions, rollup, linked_user] = await Promise.all([
        prisma.transaction.findMany({
          where: { user_id: uid, ...NOT_FUTURE, line_items: { some: { accounting_head_id: head.id } } },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        }),
        head_rollup(uid, head.id, all_heads),
        is_account && head.linked_user_id
          ? prisma.user.findUnique({ where: { id: head.linked_user_id }, select: { username: true, upi_id: true } })
          : null,
      ])

      const normalized_txns = rawTransactions.map(normalize_txn)
      const normalizedById = new Map<string, (typeof normalized_txns)[number]['line_items'][number]>()
      for (const tx of normalized_txns) for (const li of tx.line_items) normalizedById.set(li.id, li)
      const head_line_items = rawTransactions.flatMap(tx =>
        tx.line_items.filter(li => li.accounting_head_id === head.id).map(li => ({ ...li, transaction: tx })),
      )
      const uniqueAssets = Array.from(new Map(head_line_items.map(li => [li.asset.id, li.asset])).values())
      const priceByAsset = await get_prices_for_assets(uniqueAssets)

      let total = new Prisma.Decimal(0)
      const cashflows: { amount: number; when: Date }[] = []
      const by_asset_map = new Map<string, { name: string; type: asset_type; qty: Prisma.Decimal; book: Prisma.Decimal }>()
      const lines: {
        id: string
        asset: string
        asset_type: asset_type
        quantity: number
        txn_value: number
        current_value: number
        transaction_id: string
        datetime: Date
        description: string | null
        remaining_quantity: number | null
      }[] = []

      for (const li of head_line_items) {
        const n = normalizedById.get(li.id)!
        const priceData = priceByAsset.get(li.asset.id) ?? null
        const priceDecimal = priceData ? new Prisma.Decimal(priceData.price) : null
        const current_value = compute_current_value(li.asset.type, n.quantity, priceDecimal, n.txn_value)
        total = total.add(current_value)
        cashflows.push({ amount: -n.txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime })

        const e = by_asset_map.get(li.asset.id) ?? {
          name: li.asset.name,
          type: li.asset.type,
          qty: new Prisma.Decimal(0),
          book: new Prisma.Decimal(0),
        }
        e.qty = e.qty.add(n.quantity)
        e.book = e.book.add(n.txn_value)
        by_asset_map.set(li.asset.id, e)

        lines.push({
          id: li.id,
          asset: li.asset.name,
          asset_type: li.asset.type,
          quantity: n.quantity.toNumber(),
          txn_value: n.txn_value.toNumber(),
          current_value: current_value.toNumber(),
          transaction_id: li.transaction.id,
          datetime: li.datetime ?? li.transaction.datetime,
          description: li.description ?? li.transaction.description,
          remaining_quantity: null,
        })
      }

      if (is_account) {
        const lineById = new Map(head_line_items.map(li => [li.id, li]))
        const remaining_by_id = compute_fifo_remaining(
          lines
            .filter(l => l.asset_type !== asset_type.rupees)
            .map(l => ({ id: l.id, group_key: lineById.get(l.id)!.asset.id, qty: new Prisma.Decimal(l.quantity), date: l.datetime })),
        )
        for (const l of lines) l.remaining_quantity = remaining_by_id.has(l.id) ? remaining_by_id.get(l.id)!.toNumber() : null
      }

      const by_asset: { asset: string; quantity: number; txn_value: number; current_value: number }[] = []
      for (const [asset_id, e] of by_asset_map) {
        if (e.qty.equals(0)) continue
        const priceData = priceByAsset.get(asset_id) ?? null
        const cv = compute_current_value(e.type, e.qty, priceData ? new Prisma.Decimal(priceData.price) : null, e.book)
        by_asset.push({ asset: e.name, quantity: e.qty.toNumber(), txn_value: e.book.toNumber(), current_value: cv.toNumber() })
      }

      let xirr: number | null = null
      if (cashflows.length > 0) {
        if (!total.equals(0)) cashflows.push({ amount: total.toNumber(), when: new Date() })
        xirr = calculate_xirr(cashflows)
      }

      const { subtree_total, children } = rollup

      const out: Record<string, unknown> = {
        id: head.id,
        name: head.name,
        type: head.type,
        total: total.toNumber(),
        subtree_total,
        children,
        parent: head.parent ? head.parent.name : null,
        linked_user: linked_user ? { username: linked_user.username, upi_id: linked_user.upi_id } : null,
        lock_date: head.lock_date ? get_indian_date_from_date_obj(head.lock_date) : null,
        xirr,
        by_asset,
      }

      if (args.include_line_items) {
        const fromDate = args.from ? parse_day(args.from) : null
        let toDate: Date | null = null
        if (args.to) {
          toDate = parse_day(args.to)
          toDate.setDate(toDate.getDate() + 1)
        }
        const filtered = lines
          .slice()
          .sort((a, b) => b.datetime.getTime() - a.datetime.getTime())
          .filter(l => (!fromDate || l.datetime >= fromDate) && (!toDate || l.datetime < toDate))
        const offset = args.line_items_offset ?? 0
        const limit = args.line_items_limit ?? 200
        out.line_items_total = filtered.length
        if (offset > 0 || filtered.length > offset + limit)
          out.line_items_note = `showing ${Math.max(0, Math.min(limit, filtered.length - offset))} of ${filtered.length} — page with line_items_offset/line_items_limit or narrow with from/to`
        out.line_items = filtered.slice(offset, offset + limit).map(l => ({
          asset: l.asset,
          quantity: l.quantity,
          txn_value: l.txn_value,
          current_value: l.current_value,
          transaction_id: l.transaction_id,
          datetime: l.datetime,
          description: l.description,
          remaining_quantity: l.remaining_quantity,
        }))
      }

      if (args.include_timeseries && uniqueAssets.some(a => a.type === 'mf' || a.type === 'etf' || a.type === 'shares')) {
        const series = await compute_value_timeseries(
          normalized_txns,
          is_account ? { kind: 'account', accounting_head_id: head.id } : { kind: 'allocation', allocation_id: head.id },
          uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
          uid,
        )
        reconcile_timeseries_tail(series, total.toNumber(), xirr)
        out.value_timeseries = series
      }

      if (args.include_future_transactions) {
        const futureTransactions = await prisma.transaction.findMany({
          where: { user_id: uid, is_future: true, line_items: { some: { accounting_head_id: head.id } } },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
          orderBy: { datetime: 'asc' },
        })
        const current_balances = new Map<string, Prisma.Decimal>()
        for (const [asset_id, e] of by_asset_map) current_balances.set(asset_id, e.qty)
        out.future_transactions = compute_future_sufficiency(
          current_balances,
          futureTransactions.map(normalize_txn).map(tx => ({
            id: tx.id,
            datetime: tx.datetime,
            description: tx.description,
            line_items: tx.line_items
              .filter(li => li.accounting_head_id === head.id)
              .map(li => ({ asset_id: li.asset_id, quantity: li.quantity, txn_value: li.txn_value })),
          })),
        )
      }

      return text(out)
    },
  )

  server.registerTool(
    'list_transactions',
    {
      description:
        "List recent transactions (newest first) as a compact index: id, datetime, description, refs (bank refs on its line items), and amount (net inflow/outflow in INR — signed sum over the account lines, matching the web UI: positive = net in, negative = net out, ~0 = transfer). Optional text search, IST date range, and head/asset filters; when a head filter is given each row also carries head_delta (that head's own signed movement — use this for account statements, since amount nets across ALL accounts). " +
        "Set include_line_items to attach each transaction's full normalized line items (head, head_type, asset, quantity, txn_value) — use that to inspect specific transactions. Do NOT sum amount across rows to total spending/income (transfers, EMIs and investments net through here too); use get_income_expense for period totals.",
      inputSchema: {
        limit: z.number().int().positive().max(200).optional().describe('Default 20'),
        offset: z.number().int().nonnegative().optional().describe('Skip this many rows (pagination)'),
        search: z.string().optional().describe('Case-insensitive match on the transaction description'),
        head: z.string().optional().describe('Only transactions touching this accounting head (id or name)'),
        asset: z.string().optional().describe('Only transactions touching this asset (id or name)'),
        from: z.string().optional().describe('dd-MM-yyyy or yyyy-MM-dd (IST)'),
        to: z.string().optional().describe('dd-MM-yyyy or yyyy-MM-dd (IST), inclusive'),
        include_line_items: z.boolean().optional().describe("Attach each transaction's full normalized line items (default false; larger payload)"),
        future: z
          .enum(['exclude', 'only', 'include'])
          .optional()
          .describe(
            "Future transactions (is_future = true) never appear by default ('exclude'), matching the web list page; set 'only' to list just scheduled/future ones, or 'include' to show real and future together",
          ),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const take = args.limit ?? 20
      const fromDate = args.from ? parse_day(args.from) : undefined
      let toDate: Date | undefined
      if (args.to) {
        toDate = parse_day(args.to)
        toDate.setDate(toDate.getDate() + 1)
      }
      const [heads_for_filter, assets_for_filter] = await Promise.all([args.head ? load_heads(uid) : null, args.asset ? load_assets() : null])
      const filter_head = args.head ? resolve_ref(args.head, heads_for_filter!, 'accounting head') : null
      const filter_asset = args.asset ? resolve_ref(args.asset, assets_for_filter!, 'asset') : null
      const and: Prisma.transactionWhereInput[] = []
      if ((args.future ?? 'exclude') === 'exclude') and.push(NOT_FUTURE)
      else if (args.future === 'only') and.push({ is_future: true })
      if (filter_head) and.push({ line_items: { some: { accounting_head_id: filter_head.id } } })
      if (filter_asset) and.push({ line_items: { some: { asset_id: filter_asset.id } } })
      const where = {
        user_id: uid,
        ...(args.search ? { description: { contains: args.search, mode: 'insensitive' as const } } : {}),
        ...(fromDate || toDate ? { datetime: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
        ...(and.length > 0 ? { AND: and } : {}),
      }
      const orderBy = { datetime: 'desc' as const }
      const skip = args.offset ?? 0

      const txns = await prisma.transaction.findMany({ where, orderBy, take, skip, select: slim_txn_select })
      // Signed INR movement on the filtered head, from normalized lines (so
      // derived-remainder lines on allocation/income_expense heads count too).
      const deltas = new Map<string, number>()
      if (filter_head) {
        for (const raw of txns) {
          const d = normalize_line_items(raw.line_items)
            .filter(li => li.accounting_head_id === filter_head.id)
            .reduce((s, li) => s + li.txn_value.toNumber(), 0)
          deltas.set(raw.id, Math.round(d * 100) / 100)
        }
      }

      if (args.include_line_items) {
        return text(
          txns.map(raw => ({
            id: raw.id,
            datetime: raw.datetime,
            description: raw.description,
            is_future: raw.is_future,
            ...(filter_head ? { head_delta: deltas.get(raw.id) } : {}),
            line_items: normalize_line_items(raw.line_items).map(li => ({
              head: li.accounting_head.name,
              head_type: li.accounting_head.type,
              asset: li.asset.name,
              quantity: li.quantity.toNumber(),
              txn_value: li.txn_value.toNumber(),
              description: li.description,
            })),
          })),
        )
      }

      return text(
        txns.map(t => ({
          id: t.id,
          datetime: t.datetime,
          description: t.description,
          is_future: t.is_future,
          amount: net_account_flow(t.line_items),
          ...(filter_head ? { head_delta: deltas.get(t.id) } : {}),
        })),
      )
    },
  )

  server.registerTool(
    'find_similar_transactions',
    {
      description:
        'Find past transactions resembling a free-text description and return them with full normalized line items — the categorization template to reuse. ' +
        'Use this BEFORE create_transaction/update_transaction (and whenever the user gives a terse instruction like "log my barber 150" or "add a swiggy order") to learn which account, allocation and income/expense heads the user themselves picked for similar entries, instead of guessing or asking. ' +
        'The query is tokenized; a transaction matches if any word appears in its description OR in one of its head names, and results are ranked by how many distinct words matched, then by recency. Returns the same line_item shape as get_transaction.',
      inputSchema: {
        query: z.string().describe('Free-text hint, e.g. a merchant or category ("barber haircut", "swiggy lunch", "rent")'),
        limit: z.number().int().positive().max(20).optional().describe('Max transactions to return (default 5)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const take = args.limit ?? 5
      const tokens = [
        ...new Set(
          args.query
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length >= 2),
        ),
      ].slice(0, 10)
      if (tokens.length === 0) return text([])
      // Head-name matching happens in memory over the tiny heads catalog: one
      // indexed accounting_head_id branch replaces up to ten unindexable
      // double-join ILIKE subqueries in the OR. JS scoring re-ranks below, so
      // the returned results are unchanged.
      const heads = await load_heads(uid)
      const matching_head_ids = heads.filter(h => tokens.some(tok => h.name.toLowerCase().includes(tok))).map(h => h.id)
      const or: Prisma.transactionWhereInput[] = tokens.flatMap(tok => [
        { description: { contains: tok, mode: 'insensitive' as const } },
        { line_items: { some: { description: { contains: tok, mode: 'insensitive' as const } } } },
      ])
      if (matching_head_ids.length > 0) or.push({ line_items: { some: { accounting_head_id: { in: matching_head_ids } } } })
      const txns = await prisma.transaction.findMany({
        where: { user_id: uid, ...NOT_FUTURE, OR: or },
        orderBy: { datetime: 'desc' },
        take: 200,
        select: slim_txn_select,
      })
      const MAX_LINES = 12
      const scored = txns
        // Allocation-only transactions (monthly bucket moves etc.) are noise as
        // categorization templates — they carry no account or income/expense lines.
        .filter(raw => raw.line_items.some(li => li.accounting_head.type !== 'allocation'))
        .map(raw => {
          const line_items = normalize_line_items(raw.line_items)
          const descs = [raw.description ?? '', ...line_items.map(li => li.description ?? '')].join(' ').toLowerCase()
          const head_names = line_items
            .map(li => li.accounting_head.name)
            .join(' ')
            .toLowerCase()
          // Description hits outrank head-name hits so merchant matches beat
          // incidental matches on head names like "Dinner Tiffin".
          let score = 0
          for (const tok of tokens) {
            if (descs.includes(tok)) score += 2
            else if (head_names.includes(tok)) score += 1
          }
          return { raw, line_items, score }
        })
        .filter(x => x.score > 0)
      scored.sort((a, b) => b.score - a.score || new Date(b.raw.datetime).getTime() - new Date(a.raw.datetime).getTime())
      return text(
        scored.slice(0, take).map(({ raw, line_items }) => ({
          id: raw.id,
          datetime: raw.datetime,
          description: raw.description,
          total: net_account_flow(line_items),
          ...(line_items.length > MAX_LINES ? { line_items_truncated: `showing ${MAX_LINES} of ${line_items.length}` } : {}),
          line_items: line_items.slice(0, MAX_LINES).map(li => ({
            head: li.accounting_head.name,
            head_type: li.accounting_head.type,
            asset: li.asset.name,
            quantity: li.quantity.toNumber(),
            txn_value: li.txn_value.toNumber(),
            description: li.description,
          })),
        })),
      )
    },
  )

  server.registerTool(
    'get_transaction',
    {
      description:
        'Show one transaction: its total value (net inflow/outflow), all normalized line items (with head_type so they can be grouped account / allocation / income_expense), attachments (fetch content via get_attachment), and any cross-user approval links with their pending state.',
      inputSchema: { id: z.string() },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const raw = await prisma.transaction.findFirst({
        where: { id: args.id, user_id: uid },
        include: { line_items: { include: { accounting_head: true, asset: true } }, attachments: true, txn_a_links: true, txn_b_links: true },
      })
      if (!raw) return error_text('Transaction not found')
      const t = normalize_txn(raw)
      const links = [...raw.txn_a_links, ...raw.txn_b_links]
      const other_ids = [...new Set(links.map(l => (l.user_a_id === uid ? l.user_b_id : l.user_a_id)))]
      const others = other_ids.length ? await prisma.user.findMany({ where: { id: { in: other_ids } }, select: { id: true, username: true } }) : []
      const username_by_id = new Map(others.map(u => [u.id, u.username]))
      return text({
        id: t.id,
        datetime: t.datetime,
        description: t.description,
        is_future: t.is_future,
        total: net_account_flow(t.line_items),
        line_items: t.line_items.map(li => ({
          head: li.accounting_head.name,
          head_type: li.accounting_head.type,
          asset: li.asset.name,
          quantity: li.quantity.toNumber(),
          txn_value: li.txn_value.toNumber(),
          description: li.description,
        })),
        attachments: raw.attachments.map(a => ({ id: a.id, filename: a.filename, content_type: a.content_type, size: a.size })),
        links: links.map(l => ({
          link_id: l.id,
          counterparty: username_by_id.get(l.user_a_id === uid ? l.user_b_id : l.user_a_id) ?? 'unknown',
          status: l.pending_status,
          kind: l.pending_kind,
          awaiting: l.pending_by === null ? null : l.pending_by === uid ? 'me' : 'them',
        })),
      })
    },
  )

  server.registerTool(
    'list_heads',
    {
      description:
        "List accounting heads (accounts, allocations, income/expense) with parent_id for the hierarchy. Active only unless include_inactive is set. Pass include_values to attach each head's current value (matches the heads list page) — that also surfaces inactive heads that still hold a non-zero balance.",
      inputSchema: {
        type: z.enum(['account', 'allocation', 'income_expense']).optional(),
        include_inactive: z.boolean().optional().describe('Include archived/inactive heads (default false)'),
        include_values: z
          .boolean()
          .optional()
          .describe("Attach each head's current value and include inactive heads with a non-zero balance (default false)"),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      // lock_date is a day-precision IST field — serialize as dd-MM-yyyy (raw
      // Date would JSON-ify to a UTC instant reading one day early)
      const as_ist_day = <T extends { lock_date: Date | null }>(h: T) => ({
        ...h,
        lock_date: h.lock_date ? get_indian_date_from_date_obj(h.lock_date) : null,
      })
      const heads = (await load_heads(uid)).filter(h => !args.type || h.type === args.type)
      if (!args.include_values) return text(heads.filter(h => args.include_inactive || h.is_active).map(as_ist_day))

      const [{ accountsToAssets }, assets] = await Promise.all([compute_balances_core(uid), load_assets()])
      // Values only consult prices for assets present in the balance maps —
      // pricing the whole shared catalog risks blocking fetches for unheld tickers.
      const held_asset_ids = new Set<string>()
      for (const assetMap of accountsToAssets.values()) for (const asset_id of assetMap.keys()) held_asset_ids.add(asset_id)
      const priceByAsset = await get_prices_for_assets(assets.filter(a => held_asset_ids.has(a.id)))
      const rows = heads
        .map(h => {
          const assetMap = accountsToAssets.get(h.id) ?? new Map<string, { qty: number; txn_value: number }>()
          const nonzero = [...assetMap.values()].some(b => Math.abs(b.qty) > 1e-9 || Math.abs(b.txn_value) > 1e-9)
          return { head: h, value: compute_head_value(assetMap, priceByAsset).toNumber(), nonzero }
        })
        .filter(r => args.include_inactive || r.head.is_active || r.nonzero)
        .map(r => ({ ...as_ist_day(r.head), value: r.value }))
      return text(rows)
    },
  )

  server.registerTool(
    'list_assets',
    {
      description:
        "List the asset catalog with parent_id for the hierarchy. Active only unless include_inactive is set. Pass include_values to attach each asset's total quantity, current value and XIRR (matches the assets list page) — that also surfaces inactive assets still holding a non-zero quantity.",
      inputSchema: {
        include_inactive: z.boolean().optional().describe('Include inactive assets (default false)'),
        include_values: z
          .boolean()
          .optional()
          .describe('Attach total qty, current value and XIRR, and include inactive assets with non-zero qty (default false)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const assets = await load_assets()
      if (!args.include_values) return text(args.include_inactive ? assets : assets.filter(a => a.is_active))

      const { assetsToAccounts } = await compute_balances_core(uid)
      // Unheld assets contribute zero everywhere below — don't fetch the whole
      // shared catalog's quotes (a cache-missed unheld ticker blocks on network).
      const priceByAsset = await get_prices_for_assets(assets.filter(a => assetsToAccounts.has(a.id)))

      // XIRR cashflows only need the account-line flows of non-rupees assets, and
      // write validation keeps txn_value non-null on those lines (the stored value
      // equals the normalized one), so one slim query replaces the old two-pass
      // full-ledger scan; any legacy null row is skipped.
      const account_lines = await prisma.line_item.findMany({
        where: { accounting_head: { type: 'account' }, transaction: { user_id: uid, ...NOT_FUTURE }, asset: { type: { not: asset_type.rupees } } },
        select: { asset_id: true, txn_value: true, datetime: true, transaction: { select: { datetime: true } } },
      })
      const lines_by_asset = new Map<string, typeof account_lines>()
      for (const li of account_lines) {
        const arr = lines_by_asset.get(li.asset_id)
        if (arr) arr.push(li)
        else lines_by_asset.set(li.asset_id, [li])
      }

      const rows = assets
        .map(a => {
          const accMap = assetsToAccounts.get(a.id) ?? new Map<string, { qty: number; txn_value: number }>()
          const price = priceByAsset.get(a.id)?.price ?? null
          let qty = 0
          let value = new Prisma.Decimal(0)
          for (const b of accMap.values()) {
            qty += b.qty
            value = value.add(value_balance_entry(b.qty, b.txn_value, price))
          }
          const current_value = value.toNumber()
          let xirr: number | null = null
          if (a.type !== asset_type.rupees && current_value !== 0) {
            const cashflows = (lines_by_asset.get(a.id) ?? []).flatMap(li =>
              li.txn_value === null ? [] : [{ amount: -li.txn_value.toNumber(), when: li.datetime ?? li.transaction.datetime }],
            )
            if (cashflows.length > 0) {
              cashflows.push({ amount: current_value, when: new Date() })
              xirr = calculate_xirr(cashflows)
            }
          }
          return { asset: a, qty, current_value, xirr, nonzero: Math.abs(qty) > 1e-9 }
        })
        .filter(r => args.include_inactive || r.asset.is_active || r.nonzero)
        .map(r => ({
          id: r.asset.id,
          name: r.asset.name,
          type: r.asset.type,
          ticker: r.asset.ticker,
          parent_id: r.asset.parent_id,
          is_active: r.asset.is_active,
          qty: r.qty,
          current_value: r.current_value,
          xirr: r.xirr,
        }))
      return text(rows)
    },
  )

  server.registerTool(
    'list_requests',
    { description: 'Approval requests: inbox (awaiting you) and outbox (awaiting them).', inputSchema: {}, annotations: ro },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [inbox, outbox] = await Promise.all([get_inbox(uid), get_outbox(uid)])
      return text({ inbox, outbox })
    },
  )

  server.registerTool(
    'get_income_expense',
    {
      description:
        'Net income and expense by accounting head over an IST date range. This is the CORRECT way to total spending or income for a period — never sum list_transactions debit/credit for that, as those gross account flows include transfers, reimbursements, EMIs, card payments and investments that are neither income nor spend. ' +
        'Every income/expense line is included (e.g. a ₹35 lunch posts −35 to the "Expenses" head; a transfer or EMI posts nothing here). Returns one row per income/expense head with its net INR in ledger convention: spending is negative (e.g. "Expenses"), income positive (e.g. "Salary", "Interest", "Cashbacks"). Defaults to the current calendar month.',
      inputSchema: {
        from: z.string().optional().describe('dd-MM-yyyy or yyyy-MM-dd (IST). Default: first day of the current month'),
        to: z.string().optional().describe('dd-MM-yyyy or yyyy-MM-dd (IST), inclusive. Default: today'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const today = get_indian_date_from_date_obj(new Date())
      const from = args.from ?? `01-${today.slice(3)}`
      const to = args.to ?? today
      const fromDate = parse_day(from)
      const toDate = parse_day(to)
      toDate.setDate(toDate.getDate() + 1)
      const txns = await prisma.transaction.findMany({
        where: {
          user_id: uid,
          ...NOT_FUTURE,
          datetime: { gte: fromDate, lt: toDate },
          line_items: { some: { accounting_head: { type: 'income_expense' } } },
        },
        select: slim_txn_select,
      })
      const totals = new Map<string, number>()
      for (const t of txns) {
        for (const li of normalize_line_items(t.line_items)) {
          if (li.accounting_head.type !== 'income_expense') continue
          totals.set(li.accounting_head.name, (totals.get(li.accounting_head.name) ?? 0) + li.txn_value.toNumber())
        }
      }
      const rows = [...totals]
        .map(([head, net]) => ({ head, net: Math.round(net * 100) / 100 }))
        .filter(r => r.net !== 0)
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      return text({ from, to, rows, note: 'net is in ledger convention: expenses negative (money out), income positive (money in)' })
    },
  )

  server.registerTool(
    'create_transaction',
    {
      description:
        'Create a transaction from balanced line items (accounts/assets by id or name). ' +
        'Call find_similar_transactions FIRST with the user\'s description to see how they categorized similar entries before, and reuse those exact heads rather than guessing or asking. Call list_heads and list_assets to get exact head/asset names — do not guess them (the rupee asset is usually named "Money", not "INR"/"Rupees"). ' +
        'A simple cash expense is three lines: the account you paid from, one allocation head, and one income/expense head. ' +
        'Null-remainder rule, applied per asset: every account line needs an explicit signed quantity; then omit quantity on exactly one allocation line AND on exactly one income/expense line (both auto-derived as the balancing remainder — do not also fill them). ' +
        'For rupee assets never set txn_value. ' +
        'Example — spend ₹150 from Kotak on Barber: [{account:"Kotak", asset:"Money", quantity:-150}, {account:"Expenses", asset:"Money"}, {account:"Barber", asset:"Money"}]. ' +
        'When importing from a statement, always set an idempotency_key so retries and re-imports can never double-post. ' +
        'The response echoes the resulting balances of the touched accounts — sanity-check them. A near-duplicate (same account, same net amount, within ±1 day) is rejected with the matching id unless force is true.',
      inputSchema: {
        description: z.string().nullish(),
        datetime: z.string().optional().describe('dd-MM-yyyy or ISO; default now'),
        line_items: lineItemShape,
        idempotency_key: z
          .string()
          .nullish()
          .describe(
            'Stable dedup token: re-creating with the same key returns the existing transaction instead of double-posting. Use on any retry-prone or imported entry.',
          ),
        dry_run: z.boolean().optional().describe('Validate and echo the derived remainder lines without writing anything'),
        force: z.boolean().optional().describe('Create even if a possible duplicate exists'),
        is_future: z
          .boolean()
          .optional()
          .describe(
            'Create as a future transaction (default false): a scheduled private draft that never appears on the transactions list and never affects balances, net worth or XIRR until converted with convert_future_transaction. Safe to use on linked/shared accounts (no mirror/approval is created until it becomes real).',
          ),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [heads, assets] = await Promise.all([load_heads(uid), load_assets()])
      const line_items = await build_line_items(uid, args.line_items, { heads, assets })
      const datetime = parse_date(args.datetime)
      if (args.dry_run) {
        const dr = await dry_run_check(uid, datetime, line_items, args.description, undefined, args.is_future ?? false)
        if (!dr.isError && args.is_future && dr.content[0]?.type === 'text')
          dr.content[0].text += `\n(future transaction — ${datetime.toISOString()} scheduled, no balance effect until converted)`
        return dr
      }
      // With an idempotency_key the exact dedup in the core supersedes the
      // heuristic guard (which would otherwise block legitimate replays).
      if (!args.force && !args.idempotency_key) {
        const dupe = await find_possible_duplicate(uid, datetime, line_items, new Map(heads.map(h => [h.id, h.type])))
        if (dupe)
          return error_text(
            `Possible duplicate — not created. Existing transaction ${dupe.id} (${dupe.datetime.toISOString()}, "${dupe.description ?? ''}") already moves ${dupe.amount} on the same account within ±1 day. ` +
              'Inspect it with get_transaction; pass force:true to create anyway, or use an idempotency_key for exact dedup.',
          )
      }
      const res = await create_transaction_core(uid, datetime, line_items, args.description, {
        idempotency_key: args.idempotency_key,
        is_future: args.is_future,
      })
      if (!res.success) return action_result(res)
      const balances = await account_balances_for(
        uid,
        line_items.map(li => li.accounting_head_id),
        { heads, assets },
      )
      return text({ ok: true, message: res.message, ...res.data, account_balances: balances })
    },
  )

  server.registerTool(
    'update_transaction',
    {
      description:
        'Update a transaction. line_items REPLACE the existing ones wholesale when given; omit line_items to keep them and change only description/datetime. Attachments are preserved either way. Editing lines shared with a linked user re-opens their approval. Pass dry_run to validate replacement lines without writing. The response echoes the resulting balances of the touched accounts.',
      inputSchema: {
        id: z.string(),
        description: z.string().nullish(),
        datetime: z.string().optional().describe('dd-MM-yyyy or ISO'),
        line_items: lineItemShape.optional().describe('Omit to keep the existing line items unchanged'),
        dry_run: z.boolean().optional().describe('Validate the replacement line items without writing anything'),
        is_future: z
          .boolean()
          .optional()
          .describe(
            'Flip the future flag when set: true schedules the transaction (stops affecting balances until converted), false converts it to a real transaction. Required on the first edit of any future transaction a convert_future_transaction would create.',
          ),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [existing, heads, assets] = await Promise.all([
        prisma.transaction.findFirst({ where: { id: args.id, user_id: uid }, include: { line_items: true } }),
        load_heads(uid),
        load_assets(),
      ])
      if (!existing) return error_text('Transaction not found')
      const line_items: CreateLineItemInput[] = args.line_items
        ? await build_line_items(uid, args.line_items, { heads, assets })
        : stored_lines_to_input(existing.line_items)
      if (args.dry_run)
        return dry_run_check(
          uid,
          args.datetime ? parse_date(args.datetime) : existing.datetime,
          line_items,
          args.description,
          {
            datetime: existing.datetime,
            is_future: existing.is_future,
            line_items: existing.line_items.map(li => ({ datetime: li.datetime, accounting_head_id: li.accounting_head_id })),
          },
          args.is_future !== undefined ? args.is_future : existing.is_future,
        )
      const res = await update_transaction_core(
        uid,
        args.id,
        line_items,
        args.datetime ? parse_date(args.datetime) : undefined,
        args.description,
        args.is_future,
      )
      if (!res.success) return action_result(res)
      const touched = [...new Set([...existing.line_items.map(li => li.accounting_head_id), ...line_items.map(li => li.accounting_head_id)])]
      const balances = await account_balances_for(uid, touched, { heads, assets })
      return text({ ok: true, message: res.message, account_balances: balances })
    },
  )

  server.registerTool(
    'convert_future_transaction',
    {
      description:
        'Convert a future/scheduled transaction into a real one: it starts counting against balances, net worth, XIRR and the transactions list from that moment, and any account-head lines on linked/shared accounts create the usual mirror + approval flow (the future draft itself never did). Equivalent to editing it with is_future:false.',
      inputSchema: { id: z.string().describe('Transaction id (must currently be a future transaction)') },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [res, heads, assets] = await Promise.all([convert_future_transaction_core(uid, args.id), load_heads(uid), load_assets()])
      if (!res.success) return action_result(res)
      const balances = await account_balances_for(uid, res.data!.accounting_head_ids, { heads, assets })
      return text({ ok: true, message: res.message, account_balances: balances })
    },
  )

  server.registerTool(
    'delete_transaction',
    {
      description:
        'Permanently delete a transaction by id. There is no undo — the response returns a full snapshot of what was deleted (line items in create_transaction format) so it can be re-created with create_transaction if this was a mistake. Deleting a transaction shared with a linked user sends them a deletion request. The response echoes the resulting balances of the touched accounts.',
      inputSchema: { id: z.string() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const res = await delete_transaction_core(uid, args.id)
      if (!res.success) return action_result(res)
      const deleted = res.data!
      const snapshot = {
        datetime: deleted.datetime,
        description: deleted.description,
        line_items: deleted.line_items.map(li => ({
          account: li.account_name,
          asset: li.asset_name,
          ...(li.quantity !== null ? { quantity: li.quantity.toNumber() } : {}),
          ...(li.txn_value !== null ? { txn_value: li.txn_value.toNumber() } : {}),
          ...(li.description ? { description: li.description } : {}),
          ...(li.datetime ? { datetime: li.datetime.toISOString() } : {}),
        })),
      }
      const head_ids = deleted.line_items.map(li => li.accounting_head_id)
      const balances = await account_balances_for(uid, head_ids)
      return text({ ok: true, message: 'Transaction deleted', deleted: snapshot, account_balances: balances })
    },
  )

  server.registerTool(
    'pay',
    {
      description:
        'Record a UPI-style payment: −amount on your default account, +amount on the payee account. The response echoes the resulting balances of both accounts.',
      inputSchema: { payee_account: z.string().describe('Payee account id or name'), amount: z.number().positive(), note: z.string().nullish() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const heads = await load_heads(uid)
      const payee = resolve_ref(
        args.payee_account,
        heads.filter(h => h.type === 'account'),
        'account',
      )
      const res = await create_upi_payment_core(uid, { payee_account_id: payee.id, amount: args.amount, description: args.note })
      if (!res.success || !res.data) return action_result(res)
      const balances = await account_balances_for(uid, await head_ids_of_txn(res.data.id), { heads })
      return text({ ok: true, message: res.message, ...res.data, account_balances: balances })
    },
  )

  server.registerTool(
    'approve_request',
    {
      description:
        'Approve an inbox request (this rebuilds your copy of the shared transaction — the mirrored lines are server-derived). For a change request give either account (id or name, auto-balances your copy onto it) or balancing_lines (your own explicit lines beside the locked mirrored ones). This also affects the counterparty — tell the user what will happen before acting.',
      inputSchema: {
        link_id: z.string(),
        account: z.string().nullish().describe('Your own (non-linked) account to auto-balance onto (for change requests)'),
        balancing_lines: lineItemShape
          .optional()
          .describe('Alternative to account: your own balancing line items (the mirrored linked-account lines are added automatically)'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      let account_id: string | undefined
      if (args.account) {
        const own = (await load_heads(uid)).filter(h => h.type === 'account' && !h.linked_user_id)
        account_id = resolve_ref(args.account, own, 'account').id
      }
      const balancing = args.balancing_lines ? await build_line_items(uid, args.balancing_lines) : []
      return action_result(await approve_request_core(uid, args.link_id, balancing, account_id))
    },
  )

  server.registerTool(
    'reject_request',
    {
      description: 'Reject an inbox request by link id. The counterparty is notified and can revert their copy.',
      inputSchema: { link_id: z.string() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await reject_request_core(uid, args.link_id))
    },
  )

  register_extra_tools(server)
}

const handler = createMcpHandler(
  register_tools,
  {
    serverInfo: { name: 'ledger', version: '1.0.0' },
    instructions:
      "This is the user's personal finance ledger (triple-entry bookkeeping). The user categorizes things consistently over time, so don't make the user re-specify details you can infer from their history. " +
      'Before creating or updating a transaction — and whenever the user gives a terse instruction or asks how something should be categorized — call find_similar_transactions (or list_transactions with search + include_line_items) to see how they recorded comparable entries, and reuse the same account, allocation and income/expense heads instead of guessing or asking. ' +
      "Prefer matching the user's own past structure over inventing new heads; when a genuinely new category is needed you can create/rename/archive heads with create_head/update_head (archive with is_active:false instead of deleting). " +
      'Use get_income_expense (never a sum of transaction amounts) for period spending/income totals. ' +
      'When importing bank/UPI statements: set idempotency_key on every create so retries and re-imports never double-post, use get_balances with as_of to verify closing balances, and create_transactions for atomic bulk inserts. ' +
      'Mutating tools echo the resulting account balances — sanity-check them against what the user expects. ' +
      "Approval tools (approve/reject/cancel/revert/accept_all_from) change a linked counterparty's ledger too — state clearly what will happen before acting. " +
      'Dates accept dd-MM-yyyy or yyyy-MM-dd (IST) everywhere; datetimes also accept ISO.',
  },
  { streamableHttpEndpoint: '/api/mcp', disableSse: true },
)

const authedHandler = withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined
    const resolved = await resolve_access_token(bearer)
    if (!resolved) return undefined
    return { token: bearer, clientId: resolved.client_id, scopes: resolved.scope.split(' '), extra: { userId: resolved.user_id } }
  },
  { required: true },
)

export { authedHandler as GET, authedHandler as POST }
