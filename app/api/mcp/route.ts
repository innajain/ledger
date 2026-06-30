/**
 * Remote MCP server for the ledger. External AI clients (Claude, ChatGPT,
 * Gemini) connect here over Streamable HTTP after the OAuth 2.1 flow in
 * app/api/oauth/* and app/.well-known/*. Every tool calls the same
 * `app/_core/*` functions the web app and CLI use, scoped to the authenticated
 * user — so reads and writes (incl. cross-user approval side-effects) stay
 * identical across all surfaces.
 *
 * Read tools are annotated `readOnlyHint: true`; write tools are not, so clients
 * (e.g. ChatGPT) prompt for confirmation before they run.
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { Prisma, asset_type } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { resolve_access_token } from '@/lib/mcp/oauth'
import { compute_net_worth, subtree_total, compute_xirr_for_accounts } from '@/app/_core/valuation_core'
import { compute_balances_core } from '@/app/_core/balances_core'
import {
  create_transaction_core,
  update_transaction_core,
  delete_transaction_core,
  create_upi_payment_core,
  type CreateLineItemInput,
} from '@/app/_core/transactions_core'
import { approve_request_core, reject_request_core } from '@/app/_core/approvals_core'
import { get_inbox, get_outbox } from '@/app/_utils/links'
import { get_prices_for_assets, get_price_for_asset } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { compute_head_value, value_balance_entry } from '@/app/_utils/head_value'
import { compute_fifo_remaining } from '@/app/_utils/fifo'
import { fetch_and_normalize_transactions } from '@/app/_utils/fetch_transactions'
import { calculate_xirr } from '@/app/_utils/xirr_calculator'
import { compute_value_timeseries, reconcile_timeseries_tail } from '@/app/_utils/value_timeseries'
import { get_subtree_head_ids, compute_subtree_total } from '@/app/_utils/subtree_value'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/app/_utils/date'
import type { ActionResult } from '@/app/_actions/_result'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ToolExtra = { authInfo?: { extra?: { userId?: string } } }

function get_uid(extra: ToolExtra): string {
  const uid = extra.authInfo?.extra?.userId
  if (typeof uid !== 'string') throw new Error('Unauthorized')
  return uid
}

type Content = { content: { type: 'text'; text: string }[]; isError?: boolean }

function text(value: unknown): Content {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function action_result(res: ActionResult<unknown>): Content {
  if (res.success) return text({ ok: true, message: res.message ?? 'Done', ...(res.data ? { data: res.data } : {}) })
  return { content: [{ type: 'text', text: `Error [${res.code}]: ${res.message}` }], isError: true }
}

const load_heads = (uid: string) =>
  prisma.accounting_head.findMany({
    where: { user_id: uid },
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, is_active: true, linked_user_id: true, parent_id: true },
  })

const load_assets = () =>
  prisma.asset.findMany({
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, ticker: true, is_active: true, parent_id: true },
  })

/** Active candidate names, grouped by `type` when present, for a not-found error hint. */
function format_candidates<T extends { name: string; type?: string; is_active?: boolean }>(list: T[]): string {
  const active = list.filter(x => x.is_active !== false)
  if (!active.some(x => x.type)) return active.map(x => x.name).join(', ') || 'none'
  const groups = new Map<string, string[]>()
  for (const x of active) {
    const k = x.type ?? 'other'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(x.name)
  }
  return [...groups].map(([k, names]) => `${k}: ${names.join(', ')}`).join('; ') || 'none'
}

/** Resolve a head/asset reference that is either an exact id or a (case-insensitive) name. */
function resolve_ref<T extends { id: string; name: string; type?: string; is_active?: boolean }>(ref: string, list: T[], kind: string): T {
  const r = ref.trim()
  const byId = list.find(x => x.id === r)
  if (byId) return byId
  const byName = list.find(x => x.name.toLowerCase() === r.toLowerCase())
  if (byName) return byName
  throw new Error(`No ${kind} matching "${ref}". Valid options — ${format_candidates(list)}`)
}

/**
 * A transaction's net inflow/outflow = signed sum of txn_value over its account
 * lines — the same per-transaction total the web UI shows (positive = net in,
 * negative = net out, ~0 = transfer). Accepts raw or normalized lines: on account
 * lines txn_value is set for non-rupee assets and quantity carries the rupee value.
 */
function net_account_flow(
  line_items: { accounting_head: { type: string }; quantity: Prisma.Decimal | null; txn_value: Prisma.Decimal | null }[],
): number {
  const n = line_items
    .filter(li => li.accounting_head.type === 'account')
    .reduce((s, li) => s + (li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0), 0)
  return Math.round(n * 100) / 100
}

/**
 * Subtree value + immediate-children totals for a head — the same rollup the
 * head detail page shows, but driven by the explicit-uid balances core (the
 * page's compute_head_rollup resolves the user from request context, which MCP
 * bearer auth doesn't populate).
 */
async function head_rollup(uid: string, root_id: string): Promise<{ subtree_total: number | null; children: { name: string; total: number }[] }> {
  const all_heads = await prisma.accounting_head.findMany({ where: { user_id: uid }, select: { id: true, parent_id: true, name: true } })
  const subtree_ids = get_subtree_head_ids(root_id, all_heads)
  if (subtree_ids.size <= 1) return { subtree_total: null, children: [] }
  const { accountsToAssets: balances } = await compute_balances_core(uid)
  const subtree_asset_ids = new Set<string>()
  for (const head_id of subtree_ids) for (const asset_id of balances.get(head_id)?.keys() ?? []) subtree_asset_ids.add(asset_id)
  const subtree_assets = await prisma.asset.findMany({ where: { id: { in: [...subtree_asset_ids] } } })
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

/** Accept dd-MM-yyyy (IST) or an ISO string; default to now. */
function parse_date(s?: string): Date {
  if (!s) return new Date()
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return get_date_obj_from_indian_date(s)
  const d = new Date(s)
  if (isNaN(d.getTime())) throw new Error(`Invalid date "${s}" — use dd-MM-yyyy or ISO`)
  return d
}

const lineItemShape = z
  .array(
    z.object({
      account: z.string().describe('Accounting head: exact id or name'),
      asset: z.string().describe('Asset: exact id or name'),
      quantity: z
        .number()
        .optional()
        .describe(
          'Signed quantity. REQUIRED on every account head. On allocation heads omit it on exactly one line, and on income/expense heads omit it on exactly one line — those are auto-derived as the balancing remainder.',
        ),
      txn_value: z
        .number()
        .nullish()
        .describe(
          'Non-rupee assets only: signed rupee value, required on account lines and auto-derived on the one omitted line per side. Omit entirely for rupee assets.',
        ),
      description: z.string().nullish(),
    }),
  )
  .min(1, 'At least one line item is required')

/** Map MCP line-item inputs (account/asset by id-or-name) to core inputs. */
async function build_line_items(uid: string, items: z.infer<typeof lineItemShape>): Promise<CreateLineItemInput[]> {
  const [heads, assets] = await Promise.all([load_heads(uid), load_assets()])
  return items.map(li => ({
    accounting_head_id: resolve_ref(li.account, heads, 'account').id,
    asset_id: resolve_ref(li.asset, assets, 'asset').id,
    quantity: li.quantity,
    txn_value: li.txn_value,
    description: li.description,
  }))
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

function register_tools(server: McpServer) {
  // Route every tool handler through a try/catch that logs unexpected throws before
  // mcp-handler turns them into a JSON-RPC error. Write tools surface failures via
  // ActionResult (logged inside the *_core functions), but read tools throw raw —
  // without this a DB/price-fetch fault in a read tool would fail silently in our logs.
  // We patch registerTool once so every call site keeps its zod-inferred handler types.
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
      const priceByAsset = await get_prices_for_assets(assets)
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
        include_line_items: z.boolean().optional().describe('Attach per-account line items with FIFO remaining (default false)'),
        include_timeseries: z.boolean().optional().describe('Attach the value-over-time series for priced assets (default false)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const ref = resolve_ref(args.asset, await load_assets(), 'asset')
      const asset = await prisma.asset.findUnique({
        where: { id: ref.id },
        include: {
          // Assets are global; their line items belong to individual users — scope to the caller.
          line_items: { where: { transaction: { user_id: uid } }, include: { accounting_head: true, transaction: true } },
          parent: true,
          children: true,
        },
      })
      if (!asset) return { content: [{ type: 'text', text: 'Asset not found' }], isError: true }
      const is_rupees = asset.type === asset_type.rupees

      const { rawTransactions, normalizedById } = await fetch_and_normalize_transactions(asset.line_items)
      const real_line_items = asset.line_items.filter(li => li.accounting_head.type === 'account')
      const allocation_line_items = asset.line_items.filter(li => li.accounting_head.type === 'allocation')
      const priceResp = await get_price_for_asset(asset.type, asset.ticker ?? null)
      const priceDecimal = priceResp ? new Prisma.Decimal(priceResp.price) : null

      // Aggregate per account
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

      // Aggregate per allocation
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

      // FIFO remaining per account line (non-rupee only) + current investment
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

      // XIRR (non-rupee): each account line an outflow, current value an inflow today
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
        out.line_items = items
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
      }

      if (args.include_timeseries && (asset.type === 'mf' || asset.type === 'etf' || asset.type === 'shares')) {
        const series = await compute_value_timeseries(rawTransactions, { kind: 'asset', asset_id: asset.id }, [
          { id: asset.id, type: asset.type, ticker: asset.ticker },
        ])
        reconcile_timeseries_tail(series, asset_total.toNumber(), xirr)
        out.value_timeseries = series
      }

      return text(out)
    },
  )

  server.registerTool(
    'get_balances',
    { description: 'Per-account asset balances (quantity and value).', inputSchema: {}, annotations: ro },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [{ accountsToAssets }, heads, assets] = await Promise.all([compute_balances_core(uid), load_heads(uid), load_assets()])
      const headById = new Map(heads.map(h => [h.id, h]))
      const assetById = new Map(assets.map(a => [a.id, a]))
      const rows: Record<string, unknown>[] = []
      for (const [headId, assetMap] of accountsToAssets) {
        const head = headById.get(headId)
        if (!head || head.type !== 'account') continue
        for (const [assetId, bal] of assetMap) {
          if (Math.abs(bal.qty) < 1e-9 && Math.abs(bal.txn_value) < 1e-9) continue
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
        include_line_items: z.boolean().optional().describe('Attach every line item touching the head (default false)'),
        include_timeseries: z.boolean().optional().describe('Attach the value-over-time series (default false)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const ref = resolve_ref(args.head, await load_heads(uid), 'account')
      const head = await prisma.accounting_head.findFirst({
        where: { id: ref.id, user_id: uid },
        include: { line_items: { include: { asset: true, transaction: true } }, parent: true },
      })
      if (!head) return { content: [{ type: 'text', text: 'Head not found' }], isError: true }
      const is_account = head.type === 'account'

      const { rawTransactions, normalizedById } = await fetch_and_normalize_transactions(head.line_items)
      const uniqueAssets = Array.from(new Map(head.line_items.map(li => [li.asset.id, li.asset])).values())
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

      for (const li of head.line_items) {
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

      // FIFO remaining units per asset (non-rupees) — accounts only
      if (is_account) {
        const lineById = new Map(head.line_items.map(li => [li.id, li]))
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

      const { subtree_total, children } = await head_rollup(uid, head.id)
      const linked_user =
        is_account && head.linked_user_id
          ? await prisma.user.findUnique({ where: { id: head.linked_user_id }, select: { username: true, upi_id: true } })
          : null

      const out: Record<string, unknown> = {
        id: head.id,
        name: head.name,
        type: head.type,
        total: total.toNumber(),
        subtree_total,
        children,
        parent: head.parent ? head.parent.name : null,
        linked_user: linked_user ? { username: linked_user.username, upi_id: linked_user.upi_id } : null,
        xirr,
        by_asset,
      }

      if (args.include_line_items) {
        out.line_items = lines
          .slice()
          .sort((a, b) => b.datetime.getTime() - a.datetime.getTime())
          .map(l => ({
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
          rawTransactions,
          is_account ? { kind: 'account', accounting_head_id: head.id } : { kind: 'allocation', allocation_id: head.id },
          uniqueAssets.map(a => ({ id: a.id, type: a.type, ticker: a.ticker })),
        )
        reconcile_timeseries_tail(series, total.toNumber(), xirr)
        out.value_timeseries = series
      }

      return text(out)
    },
  )

  server.registerTool(
    'list_transactions',
    {
      description:
        'List recent transactions (newest first) as a compact index: id, datetime, description, and amount (net inflow/outflow in INR — signed sum over the account lines, matching the web UI: positive = net in, negative = net out, ~0 = transfer). Optional text search and IST date range (dd-MM-yyyy). ' +
        "Set include_line_items to attach each transaction's full normalized line items (head, head_type, asset, quantity, txn_value) — use that to inspect specific transactions. Do NOT sum amount across rows to total spending/income (transfers, EMIs and investments net through here too); use get_income_expense for period totals.",
      inputSchema: {
        limit: z.number().int().positive().max(200).optional(),
        search: z.string().optional(),
        from: z.string().optional().describe('dd-MM-yyyy'),
        to: z.string().optional().describe('dd-MM-yyyy'),
        include_line_items: z.boolean().optional().describe("Attach each transaction's full normalized line items (default false; larger payload)"),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const take = args.limit ?? 20
      const fromDate = args.from ? get_date_obj_from_indian_date(args.from) : undefined
      let toDate: Date | undefined
      if (args.to) {
        toDate = get_date_obj_from_indian_date(args.to)
        toDate.setDate(toDate.getDate() + 1)
      }
      const where = {
        user_id: uid,
        ...(args.search ? { description: { contains: args.search, mode: 'insensitive' as const } } : {}),
        ...(fromDate || toDate ? { datetime: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
      }
      const orderBy = { datetime: 'desc' as const }

      if (args.include_line_items) {
        const txns = await prisma.transaction.findMany({
          where,
          orderBy,
          take,
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        })
        return text(
          txns.map(normalize_txn).map(t => ({
            id: t.id,
            datetime: t.datetime,
            description: t.description,
            line_items: t.line_items.map(li => ({
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

      const txns = await prisma.transaction.findMany({
        where,
        orderBy,
        take,
        include: { line_items: { select: { quantity: true, txn_value: true, accounting_head: { select: { type: true } } } } },
      })
      return text(txns.map(t => ({ id: t.id, datetime: t.datetime, description: t.description, amount: net_account_flow(t.line_items) })))
    },
  )

  server.registerTool(
    'get_transaction',
    {
      description:
        'Show one transaction: its total value (net inflow/outflow) and all normalized line items, with head_type so they can be grouped account / allocation / income_expense.',
      inputSchema: { id: z.string() },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const raw = await prisma.transaction.findFirst({
        where: { id: args.id, user_id: uid },
        include: { line_items: { include: { accounting_head: true, asset: true } } },
      })
      if (!raw) return { content: [{ type: 'text', text: 'Transaction not found' }], isError: true }
      const t = normalize_txn(raw)
      return text({
        id: t.id,
        datetime: t.datetime,
        description: t.description,
        total: net_account_flow(t.line_items),
        line_items: t.line_items.map(li => ({
          head: li.accounting_head.name,
          head_type: li.accounting_head.type,
          asset: li.asset.name,
          quantity: li.quantity.toNumber(),
          txn_value: li.txn_value.toNumber(),
          description: li.description,
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
      const heads = (await load_heads(uid)).filter(h => !args.type || h.type === args.type)
      if (!args.include_values) return text(heads.filter(h => args.include_inactive || h.is_active))

      const [{ accountsToAssets }, assets] = await Promise.all([compute_balances_core(uid), load_assets()])
      const priceByAsset = await get_prices_for_assets(assets)
      const rows = heads
        .map(h => {
          const assetMap = accountsToAssets.get(h.id) ?? new Map<string, { qty: number; txn_value: number }>()
          const nonzero = [...assetMap.values()].some(b => Math.abs(b.qty) > 1e-9 || Math.abs(b.txn_value) > 1e-9)
          return { head: h, value: compute_head_value(assetMap, priceByAsset).toNumber(), nonzero }
        })
        .filter(r => args.include_inactive || r.head.is_active || r.nonzero)
        .map(r => ({ ...r.head, value: r.value }))
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
      const priceByAsset = await get_prices_for_assets(assets)
      // Normalized account-line txn_values, for per-asset XIRR (same cashflows as the assets page).
      const account_lines = await prisma.line_item.findMany({
        where: { accounting_head: { type: 'account' }, transaction: { user_id: uid } },
        include: { transaction: true },
      })
      const tx_ids = [...new Set(account_lines.map(li => li.transaction_id))]
      const txnValueById = new Map<string, number>()
      if (tx_ids.length > 0) {
        const rawTxns = await prisma.transaction.findMany({
          where: { id: { in: tx_ids } },
          include: { line_items: { include: { accounting_head: true, asset: true } } },
        })
        for (const tx of rawTxns.map(normalize_txn)) for (const li of tx.line_items) txnValueById.set(li.id, li.txn_value.toNumber())
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
            const cashflows = account_lines
              .filter(li => li.asset_id === a.id)
              .flatMap(li => {
                const v = txnValueById.get(li.id)
                return v === undefined ? [] : [{ amount: -v, when: li.datetime ?? li.transaction.datetime }]
              })
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
        from: z.string().optional().describe('dd-MM-yyyy (IST). Default: first day of the current month'),
        to: z.string().optional().describe('dd-MM-yyyy (IST), inclusive. Default: today'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const today = get_indian_date_from_date_obj(new Date())
      const from = args.from ?? `01-${today.slice(3)}`
      const to = args.to ?? today
      const fromDate = get_date_obj_from_indian_date(from)
      const toDate = get_date_obj_from_indian_date(to)
      toDate.setDate(toDate.getDate() + 1)
      const txns = await prisma.transaction.findMany({
        where: { user_id: uid, datetime: { gte: fromDate, lt: toDate }, line_items: { some: { accounting_head: { type: 'income_expense' } } } },
        include: { line_items: { include: { accounting_head: true, asset: true } } },
      })
      const totals = new Map<string, number>()
      for (const t of txns.map(normalize_txn)) {
        for (const li of t.line_items) {
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

  // --- Write tools (no readOnlyHint → clients confirm before running) ---

  server.registerTool(
    'create_transaction',
    {
      description:
        'Create a transaction from balanced line items (accounts/assets by id or name). ' +
        'Call list_heads and list_assets FIRST to get exact head/asset names — do not guess them (the rupee asset is usually named "Money", not "INR"/"Rupees"). ' +
        'A simple cash expense is three lines: the account you paid from, one allocation head, and one income/expense head. ' +
        'Null-remainder rule, applied per asset: every account line needs an explicit signed quantity; then omit quantity on exactly one allocation line AND on exactly one income/expense line (both auto-derived as the balancing remainder — do not also fill them). ' +
        'For rupee assets never set txn_value. ' +
        'Example — spend ₹150 from Kotak on Barber: [{account:"Kotak", asset:"Money", quantity:-150}, {account:"Expenses", asset:"Money"}, {account:"Barber", asset:"Money"}].',
      inputSchema: {
        description: z.string().nullish(),
        datetime: z.string().optional().describe('dd-MM-yyyy or ISO; default now'),
        line_items: lineItemShape,
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const line_items = await build_line_items(uid, args.line_items)
      return action_result(await create_transaction_core(uid, parse_date(args.datetime), line_items, args.description))
    },
  )

  server.registerTool(
    'update_transaction',
    {
      description: "Replace a transaction's line items (and optionally description/datetime).",
      inputSchema: { id: z.string(), description: z.string().nullish(), datetime: z.string().optional(), line_items: lineItemShape },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const line_items = await build_line_items(uid, args.line_items)
      return action_result(
        await update_transaction_core(uid, args.id, line_items, args.datetime ? parse_date(args.datetime) : undefined, args.description),
      )
    },
  )

  server.registerTool('delete_transaction', { description: 'Delete a transaction by id.', inputSchema: { id: z.string() } }, async (args, extra) => {
    const uid = get_uid(extra as ToolExtra)
    return action_result(await delete_transaction_core(uid, args.id))
  })

  server.registerTool(
    'pay',
    {
      description: 'Record a UPI-style payment: −amount on your default account, +amount on the payee account.',
      inputSchema: { payee_account: z.string().describe('Payee account id or name'), amount: z.number().positive(), note: z.string().nullish() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const accounts = (await load_heads(uid)).filter(h => h.type === 'account')
      const payee = resolve_ref(args.payee_account, accounts, 'account')
      return action_result(await create_upi_payment_core(uid, { payee_account_id: payee.id, amount: args.amount, description: args.note }))
    },
  )

  server.registerTool(
    'approve_request',
    {
      description: 'Approve an inbox request. For a change request, give an account (id or name) to auto-balance your own copy onto.',
      inputSchema: { link_id: z.string(), account: z.string().nullish().describe('Your own account to balance onto (for change requests)') },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      let account_id: string | undefined
      if (args.account) {
        const own = (await load_heads(uid)).filter(h => h.type === 'account' && !h.linked_user_id)
        account_id = resolve_ref(args.account, own, 'account').id
      }
      return action_result(await approve_request_core(uid, args.link_id, [], account_id))
    },
  )

  server.registerTool(
    'reject_request',
    { description: 'Reject an inbox request by link id.', inputSchema: { link_id: z.string() } },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await reject_request_core(uid, args.link_id))
    },
  )
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const handler = createMcpHandler(
  register_tools,
  { serverInfo: { name: 'ledger', version: '1.0.0' } },
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
