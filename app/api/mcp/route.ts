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
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
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
import { get_prices_for_assets } from '@/app/_utils/price_fetcher'
import { compute_current_value } from '@/app/_utils/compute_current_value'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
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
    select: { id: true, name: true, type: true, ticker: true, is_active: true },
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
  const ro = { readOnlyHint: true } as const

  server.registerTool(
    'get_net_worth',
    {
      description: 'Total net worth and the Investments XIRR. Pass include_allocations to also get the per-head allocation breakdown.',
      inputSchema: { include_allocations: z.boolean().optional().describe('Include the full allocation breakdown (default false)') },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const { networth, allocations } = await compute_net_worth(uid)
      const invest = subtree_total(allocations, 'Investments')
      const xirr = invest && invest.total !== 0 ? await compute_xirr_for_accounts(uid, invest.ids, invest.total) : null
      return text({
        net_worth: networth,
        investments: invest?.total ?? 0,
        investments_xirr: xirr,
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
    'list_transactions',
    {
      description:
        'List recent transactions with debit/credit amounts. Optional text search and IST date range (dd-MM-yyyy). debit = money flowing out of accounts (expenses, transfers out); credit = money flowing in (income, transfers in).',
      inputSchema: {
        limit: z.number().int().positive().max(200).optional(),
        search: z.string().optional(),
        from: z.string().optional().describe('dd-MM-yyyy'),
        to: z.string().optional().describe('dd-MM-yyyy'),
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
      const txns = await prisma.transaction.findMany({
        where: {
          user_id: uid,
          ...(args.search ? { description: { contains: args.search, mode: 'insensitive' } } : {}),
          ...(fromDate || toDate ? { datetime: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
        },
        orderBy: { datetime: 'desc' },
        take,
        include: {
          _count: { select: { line_items: true } },
          line_items: { select: { quantity: true, txn_value: true, accounting_head: { select: { type: true } } } },
        },
      })
      return text(
        txns.map(t => {
          // For rupee assets txn_value is null in DB; quantity holds the INR amount.
          // For non-rupee assets txn_value holds the INR value.
          const inr = (li: { quantity: { toNumber(): number } | null; txn_value: { toNumber(): number } | null }) =>
            li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0
          const account_lines = t.line_items.filter(li => li.accounting_head.type === 'account')
          const debit = account_lines.reduce((s, li) => {
            const v = inr(li)
            return v < 0 ? s + Math.abs(v) : s
          }, 0)
          const credit = account_lines.reduce((s, li) => {
            const v = inr(li)
            return v > 0 ? s + v : s
          }, 0)
          return {
            id: t.id,
            datetime: t.datetime,
            description: t.description,
            line_count: t._count.line_items,
            debit,
            credit,
          }
        }),
      )
    },
  )

  server.registerTool(
    'get_transaction',
    { description: "Show one transaction's line items.", inputSchema: { id: z.string() }, annotations: ro },
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
      description: 'List accounting heads (accounts, allocations, income/expense). Active only unless include_inactive is set.',
      inputSchema: {
        type: z.enum(['account', 'allocation', 'income_expense']).optional(),
        include_inactive: z.boolean().optional().describe('Include archived/inactive heads (default false)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const heads = await load_heads(uid)
      return text(heads.filter(h => (!args.type || h.type === args.type) && (args.include_inactive || h.is_active)))
    },
  )

  server.registerTool(
    'list_assets',
    {
      description: 'List the asset catalog. Active only unless include_inactive is set.',
      inputSchema: { include_inactive: z.boolean().optional().describe('Include inactive assets (default false)') },
      annotations: ro,
    },
    async (args, extra) => {
      get_uid(extra as ToolExtra)
      const assets = await load_assets()
      return text(args.include_inactive ? assets : assets.filter(a => a.is_active))
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
