import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { put, del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import {
  find_user_by_username_core,
  create_account_core,
  update_account_core,
  delete_account_core,
  create_asset_core,
  update_asset_core,
  delete_asset_core,
  reorder_heads_core,
  reorder_assets_core,
} from '@/app/_core/resources_core'
import {
  create_transaction_template_core,
  get_transaction_templates_core,
  update_transaction_template_core,
  delete_transaction_template_core,
} from '@/app/_core/templates_core'
import { cancel_request_core, revert_request_core, accept_all_from_core } from '@/app/_core/approvals_core'
import { list_sent_notifications_core, notify_linked_user_core } from '@/app/_core/notifications_core'
import {
  list_transaction_tags_core,
  get_transaction_tag_core,
  create_transaction_tag_core,
  update_transaction_tag_core,
  delete_transaction_tag_core,
  set_transaction_tags_core,
  add_transactions_to_tag_core,
  remove_transactions_from_tag_core,
} from '@/app/_core/tags_core'
import { create_transactions_core, type BulkTransactionInput, type CreateLineItemInput } from '@/app/_core/transactions_core'
import {
  get_user_preferences_core,
  update_user_preferences_core,
  get_line_item_defaults_core,
  update_line_item_defaults_core,
  update_own_upi_core,
  type UserPreferences,
} from '@/app/_core/preferences_core'
import {
  type ToolExtra,
  type Content,
  get_uid,
  get_origin,
  text,
  error_text,
  action_result,
  load_heads,
  load_assets,
  load_tags,
  resolve_ref,
  parse_date,
  parse_day,
  lineItemShape,
  ist_datetime,
  templateLineItemShape,
  build_line_items,
  require_admin,
  resolve_counterparty,
  account_balances_for,
} from './_helpers'
import { compute_tax_for_fy, serialize_tax_result } from '@/app/_core/tax_core'
import { current_financial_year, parse_fy, fy_label } from '@/app/_utils/financial_year'
import { audit } from '@/lib/logger'
import {
  ATTACHMENT_TYPE_BY_EXT,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_INLINE_ATTACHMENT_BYTES,
  verify_attachment_bytes,
} from '@/app/_utils/attachment_content'
import { create_upload_grant, UPLOAD_TOKEN_TTL_MS } from '@/lib/mcp/attachment_upload'

const head_type_enum = z.enum(['account', 'allocation', 'income_expense'])
const asset_type_enum = z.enum(['rupees', 'mf', 'etf', 'shares', 'other'])
const tax_treatment_enum = z.enum([
  'salary_17_1',
  'perquisite_17_2',
  'exempt',
  'other_sources',
  'stcg_slab',
  'stcg_111a',
  'ltcg_112a',
  'gift_56_2_x',
  'tax_paid',
  'not_income',
])

function blob_fetch_url(att_url: string, pathname: string): string | null {
  if (env.NEXT_PUBLIC_VERCEL_BLOB_API_URL) return `${new URL(env.NEXT_PUBLIC_VERCEL_BLOB_API_URL).origin}/${pathname}`
  let parsed: URL
  try {
    parsed = new URL(att_url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.hostname !== 'blob.vercel-storage.com' && !parsed.hostname.endsWith('.blob.vercel-storage.com')) return null
  return parsed.toString()
}

async function owned_attachment(uid: string, attachment_id: string) {
  const att = await prisma.transaction_attachment.findUnique({
    where: { id: attachment_id },
    include: { transaction: { select: { user_id: true } } },
  })
  if (!att || att.transaction.user_id !== uid) return null
  return att
}

const DUP_WINDOW_MS = 36 * 60 * 60 * 1000
const DUP_CHECK_CONCURRENCY = 8

type DupHit = { index: number; dupe: { id: string; datetime: Date; description: string | null; amount: number } }

// Batched equivalent of find_possible_duplicate (transactions_core) for bulk
// creates: head types come from the already-loaded user catalog instead of a
// per-item query, and the ±36h candidate scans run concurrently in small chunks
// (bounded for the pooled connection). Chunks are processed in index order and
// the lowest-index hit is returned, so first-index-wins semantics match the old
// serial loop — nothing is written between checks.
async function find_first_bulk_duplicate(uid: string, built: BulkTransactionInput[], heads: { id: string; type: string }[]): Promise<DupHit | null> {
  const account_head_ids = new Set(heads.filter(h => h.type === 'account').map(h => h.id))
  const checks: { index: number; account_ids: string[]; flow: number; datetime: Date }[] = []
  for (const [index, b] of built.entries()) {
    if (b.idempotency_key) continue
    const account_ids = [...new Set(b.line_items.map(li => li.accounting_head_id).filter(id => account_head_ids.has(id)))]
    if (account_ids.length === 0) continue
    const account_id_set = new Set(account_ids)
    const flow =
      Math.round(
        b.line_items.filter(li => account_id_set.has(li.accounting_head_id)).reduce((s, li) => s + (li.txn_value ?? li.quantity ?? 0), 0) * 100,
      ) / 100
    if (flow === 0) continue
    checks.push({ index, account_ids, flow, datetime: b.datetime })
  }
  for (let start = 0; start < checks.length; start += DUP_CHECK_CONCURRENCY) {
    const hits = await Promise.all(
      checks.slice(start, start + DUP_CHECK_CONCURRENCY).map(async c => {
        const candidates = await prisma.transaction.findMany({
          where: {
            user_id: uid,
            datetime: { gte: new Date(c.datetime.getTime() - DUP_WINDOW_MS), lte: new Date(c.datetime.getTime() + DUP_WINDOW_MS) },
            line_items: { some: { accounting_head_id: { in: c.account_ids } } },
          },
          include: { line_items: { select: { quantity: true, txn_value: true, accounting_head: { select: { type: true } } } } },
          orderBy: { datetime: 'desc' },
          take: 50,
        })
        for (const t of candidates) {
          const candidate_flow = t.line_items
            .filter(li => li.accounting_head.type === 'account')
            .reduce((s, li) => s + (li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0), 0)
          if (Math.abs(Math.round(candidate_flow * 100) / 100 - c.flow) <= 0.01)
            return { index: c.index, dupe: { id: t.id, datetime: t.datetime, description: t.description, amount: c.flow } } satisfies DupHit
        }
        return null
      }),
    )
    const hit = hits.filter((h): h is DupHit => h !== null).sort((a, b) => a.index - b.index)[0]
    if (hit) return hit
  }
  return null
}

async function settings_payload(uid: string) {
  const [user, prefs, defaults, heads, assets] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid }, select: { username: true, upi_id: true, is_admin: true } }),
    get_user_preferences_core(uid),
    get_line_item_defaults_core(uid),
    load_heads(uid),
    load_assets(),
  ])
  const head_name = (id: string | null) => (id ? (heads.find(h => h.id === id)?.name ?? id) : null)
  return {
    username: user?.username ?? null,
    is_admin: user?.is_admin ?? false,
    upi_id: user?.upi_id ?? null,
    preferences: prefs,
    line_item_defaults: {
      account: head_name(defaults.default_account_id),
      allocation: head_name(defaults.default_allocation_id),
      income_expense: head_name(defaults.default_income_expense_id),
      asset: defaults.default_asset_id ? (assets.find(a => a.id === defaults.default_asset_id)?.name ?? defaults.default_asset_id) : null,
    },
  }
}

export function register_extra_tools(server: McpServer) {
  server.registerTool(
    'create_head',
    {
      description:
        'Create an accounting head: an account (bank/wallet/person/broker), allocation (bucket like Savings/Investments) or income_expense category. Optionally nest under a parent of the same type, or link an account head to another user by username — transactions touching a linked account then sync to that user for approval. Prefer reusing existing heads (list_heads / find_similar_transactions) over creating near-duplicates. An income_expense head can carry a tax_treatment so it feeds get_tax_computation instead of landing in its unclassified list.',
      inputSchema: {
        name: z.string(),
        type: head_type_enum,
        parent: z.string().optional().describe('Parent head id or name (same type) to nest under'),
        linked_username: z.string().optional().describe('account type only: link to this user for cross-user sync'),
        tax_treatment: tax_treatment_enum
          .optional()
          .describe(
            'income/expense only: how this head counts toward income tax (new regime). salary_17_1 = §17(1) salary, perquisite_17_2 = §17(2) perks, exempt = employer PF/exempt allowances, other_sources = bank interest/residual slab-rate, stcg_slab = debt MF §50AA, stcg_111a = STT-paid equity short-term 20%, ltcg_112a = STT-paid equity long-term 12.5% over ₹1.25L, gift_56_2_x = ₹56(2)(x) gifts (all-or-nothing), tax_paid = TDS/advance/self-assessment credit, not_income = cashbacks/discounts/reimbursements',
          ),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      let parent_id: string | null = null
      if (args.parent) {
        const heads = await load_heads(uid)
        parent_id = resolve_ref(
          args.parent,
          heads.filter(h => h.type === args.type),
          `${args.type} head`,
        ).id
      }
      let linked_user_id: string | null = null
      if (args.linked_username) {
        const found = await find_user_by_username_core(uid, args.linked_username)
        if (!found.success) return action_result(found)
        linked_user_id = found.data!.id
      }
      const res = await create_account_core(uid, args.name, args.type, parent_id, linked_user_id, args.tax_treatment ?? null)
      if (!res.success) return action_result(res)
      const created = await prisma.accounting_head.findFirst({ where: { user_id: uid, name: args.name.trim() }, select: { id: true } })
      return text({ ok: true, id: created?.id, message: 'Head created' })
    },
  )

  server.registerTool(
    'update_head',
    {
      description:
        'Update an accounting head: rename, move under a new parent (or clear_parent for top level), enable/disable via is_active (false archives it — hidden from pickers, history kept; this is the right way to retire a head), mark as placeholder (grouping-only), link/unlink another user (accounts only; unlinking is blocked while shared transactions exist), set/clear a reconciliation lock_date (accounts only: line items dated on/before that IST day are verified against the real account and every write touching them is rejected until the lock is moved back), or set/clear a tax_treatment (income/expense only: how the head counts toward income tax — unclassified heads are excluded from get_tax_computation).',
      inputSchema: {
        head: z.string().describe('Head id or name'),
        name: z.string().optional(),
        parent: z.string().optional().describe('New parent head id or name (same type)'),
        clear_parent: z.boolean().optional().describe('Move to top level'),
        is_active: z.boolean().optional().describe('false = archive/disable, true = re-enable'),
        is_placeholder: z.boolean().optional().describe('Placeholder heads only group children'),
        linked_username: z.string().optional().describe('Link this account head to a user by username'),
        clear_linked_user: z.boolean().optional().describe('Remove the cross-user link'),
        lock_date: z
          .string()
          .optional()
          .describe('account only: reconciliation lock (dd-MM-yyyy or yyyy-MM-dd) — writes touching line items on/before this day are rejected'),
        clear_lock_date: z.boolean().optional().describe('Remove the reconciliation lock'),
        tax_treatment: tax_treatment_enum
          .optional()
          .describe(
            'income/expense only: how this head counts toward income tax (new regime). salary_17_1 = §17(1) salary, perquisite_17_2 = §17(2) perks, exempt = employer PF/exempt allowances, other_sources = bank interest/residual slab-rate, stcg_slab = debt MF §50AA, stcg_111a = STT-paid equity short-term 20%, ltcg_112a = STT-paid equity long-term 12.5% over ₹1.25L, gift_56_2_x = ₹56(2)(x) gifts (all-or-nothing), tax_paid = TDS/advance/self-assessment credit, not_income = cashbacks/discounts/reimbursements',
          ),
        clear_tax_treatment: z.boolean().optional().describe('Remove the tax treatment (head becomes unclassified)'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const heads = await load_heads(uid)
      const target = resolve_ref(args.head, heads, 'accounting head')
      if (args.parent && args.clear_parent) return error_text('Give either parent or clear_parent, not both')
      if (args.linked_username && args.clear_linked_user) return error_text('Give either linked_username or clear_linked_user, not both')
      if (args.lock_date && args.clear_lock_date) return error_text('Give either lock_date or clear_lock_date, not both')
      if (args.tax_treatment && args.clear_tax_treatment) return error_text('Give either tax_treatment or clear_tax_treatment, not both')
      const lock_date = args.clear_lock_date ? null : args.lock_date ? parse_day(args.lock_date) : undefined
      const tax_treatment = args.clear_tax_treatment ? null : (args.tax_treatment ?? undefined)
      // null = clear, value = set, undefined = keep
      const parent_id = args.clear_parent
        ? null
        : args.parent
          ? resolve_ref(
              args.parent,
              heads.filter(h => h.type === target.type && h.id !== target.id),
              `${target.type} head`,
            ).id
          : undefined
      let linked_user_id: string | null | undefined = args.clear_linked_user ? null : undefined
      if (args.linked_username) {
        const found = await find_user_by_username_core(uid, args.linked_username)
        if (!found.success) return action_result(found)
        linked_user_id = found.data!.id
      }
      return action_result(
        await update_account_core(
          uid,
          target.id,
          args.name,
          undefined,
          parent_id,
          args.is_active,
          args.is_placeholder,
          linked_user_id,
          lock_date,
          tax_treatment,
        ),
      )
    },
  )

  server.registerTool(
    'delete_head',
    {
      description:
        'Permanently delete an accounting head. Only possible while nothing references it (no transactions or templates) — for a head with history, archive it instead with update_head is_active:false.',
      inputSchema: { head: z.string().describe('Head id or name') },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = resolve_ref(args.head, await load_heads(uid), 'accounting head')
      return action_result(await delete_account_core(uid, target.id))
    },
  )

  server.registerTool(
    'create_asset',
    {
      description:
        'Create an asset in the shared catalog (admin only — assets are global across users). Types: rupees (cash), mf (mutual fund, ticker = AMFI scheme code), etf/shares (ticker = Yahoo Finance symbol like "NIFTYBEES.NS"), other (untracked value). Tickers are validated against the live price source.',
      inputSchema: {
        name: z.string(),
        type: asset_type_enum,
        ticker: z.string().nullish().describe('Required for mf/etf/shares, forbidden otherwise'),
        parent: z.string().optional().describe('Parent asset id or name to nest under'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      await require_admin(uid)
      const parent_id = args.parent ? resolve_ref(args.parent, await load_assets(), 'asset').id : null
      const res = await create_asset_core(args.name, args.type, args.ticker, parent_id)
      if (!res.success) return action_result(res)
      audit('asset.create', uid, { asset_type: args.type, surface: 'mcp' })
      const created = await prisma.asset.findUnique({ where: { name: args.name.trim() }, select: { id: true } })
      return text({ ok: true, id: created?.id, message: 'Asset created' })
    },
  )

  server.registerTool(
    'update_asset',
    {
      description:
        'Update an asset in the shared catalog (admin only): rename, change type/ticker, move under a new parent (or clear_parent), enable/disable via is_active, or mark as placeholder. Tickers are validated against the live price source.',
      inputSchema: {
        asset: z.string().describe('Asset id or name'),
        name: z.string().optional(),
        type: asset_type_enum.optional(),
        ticker: z.string().optional(),
        clear_ticker: z.boolean().optional().describe('Remove the ticker (only valid for rupees/other types)'),
        parent: z.string().optional().describe('New parent asset id or name'),
        clear_parent: z.boolean().optional().describe('Move to top level'),
        is_active: z.boolean().optional().describe('false = archive/disable, true = re-enable'),
        is_placeholder: z.boolean().optional(),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      await require_admin(uid)
      const assets = await load_assets()
      const target = resolve_ref(args.asset, assets, 'asset')
      if (args.parent && args.clear_parent) return error_text('Give either parent or clear_parent, not both')
      if (args.ticker && args.clear_ticker) return error_text('Give either ticker or clear_ticker, not both')
      const parent_id = args.clear_parent
        ? null
        : args.parent
          ? resolve_ref(
              args.parent,
              assets.filter(a => a.id !== target.id),
              'asset',
            ).id
          : undefined
      const ticker = args.clear_ticker ? null : args.ticker
      const result = await update_asset_core(target.id, args.name, args.type, ticker, parent_id, args.is_active, args.is_placeholder)
      if (result.success) audit('asset.update', uid, { surface: 'mcp' })
      return action_result(result)
    },
  )

  server.registerTool(
    'delete_asset',
    {
      description:
        'Permanently delete an asset from the shared catalog (admin only). Only possible while no transactions or templates reference it — otherwise archive it with update_asset is_active:false.',
      inputSchema: { asset: z.string().describe('Asset id or name') },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      await require_admin(uid)
      const target = resolve_ref(args.asset, await load_assets(), 'asset')
      const result = await delete_asset_core(target.id)
      if (result.success) audit('asset.delete', uid, { surface: 'mcp' })
      return action_result(result)
    },
  )

  server.registerTool(
    'reorder_siblings',
    {
      description:
        "Set the display order of items under one parent (used everywhere lists are shown). scope 'heads' reorders your accounting heads; scope 'assets' reorders the shared asset catalog (admin only). Pass every sibling under that parent (top level when parent is omitted) as ids or names in the desired order.",
      inputSchema: {
        scope: z.enum(['heads', 'assets']),
        parent: z.string().optional().describe('Parent id or name; omit for top-level items'),
        ordered: z.array(z.string()).min(1).describe('All siblings under that parent, in the desired order'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      if (args.scope === 'heads') {
        const heads = await load_heads(uid)
        const parent_id = args.parent ? resolve_ref(args.parent, heads, 'accounting head').id : null
        const ids = args.ordered.map(r => resolve_ref(r, heads, 'accounting head').id)
        return action_result(await reorder_heads_core(uid, parent_id, ids))
      }
      await require_admin(uid)
      const assets = await load_assets()
      const parent_id = args.parent ? resolve_ref(args.parent, assets, 'asset').id : null
      const ids = args.ordered.map(r => resolve_ref(r, assets, 'asset').id)
      const result = await reorder_assets_core(parent_id, ids)
      if (result.success) audit('asset.reorder', uid, { item_count: ids.length, surface: 'mcp' })
      return action_result(result)
    },
  )

  server.registerTool(
    'list_templates',
    {
      description:
        'List saved transaction templates (reusable prefills for recurring entries like rent or salary). To use one, copy its line items into create_transaction, filling any omitted amounts.',
      inputSchema: {},
    },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const templates = await get_transaction_templates_core(uid)
      return text(
        templates.map(t => ({
          id: t.id,
          description: t.description,
          line_items: t.line_items.map(li => ({
            head: li.accounting_head.name,
            head_type: li.accounting_head.type,
            asset: li.asset.name,
            quantity: li.quantity === null ? null : li.quantity.toNumber(),
            txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
            description: li.description,
          })),
        })),
      )
    },
  )

  server.registerTool(
    'create_template',
    {
      description:
        'Save a transaction template — a reusable prefill for a recurring entry (rent, salary, SIP). Lines need not balance; amounts may be omitted and filled at use time.',
      inputSchema: { description: z.string().nullish().describe('Template name shown in pickers'), line_items: templateLineItemShape },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const line_items = await build_line_items(uid, args.line_items)
      const res = await create_transaction_template_core(uid, line_items, args.description)
      if (!res.success) return action_result(res)
      return text({ ok: true, id: res.data!.id, message: res.message ?? 'Template created' })
    },
  )

  server.registerTool(
    'update_template',
    {
      description: "Replace a template's line items (and optionally its description).",
      inputSchema: { id: z.string(), description: z.string().nullish(), line_items: templateLineItemShape },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const line_items = await build_line_items(uid, args.line_items)
      const res = await update_transaction_template_core(uid, args.id, line_items, args.description)
      if (!res.success) return action_result(res)
      return text({ ok: true, id: res.data!.id, message: res.message ?? 'Template updated' })
    },
  )

  server.registerTool(
    'delete_template',
    { description: 'Delete a transaction template by id (transactions created from it are unaffected).', inputSchema: { id: z.string() } },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await delete_transaction_template_core(uid, args.id))
    },
  )

  server.registerTool(
    'create_transactions',
    {
      description:
        'Create up to 50 transactions atomically — all commit or none do (one failure aborts the whole batch with the failing index). Same line-item rules as create_transaction. For statement imports give each item an idempotency_key: items whose key already exists are replayed (returned, not re-created), so re-running a partially failed import is safe. The near-duplicate guard runs per item without a key unless force is true. The response echoes the resulting balances of all touched accounts.',
      inputSchema: {
        transactions: z
          .array(
            z.object({
              description: z.string().nullish(),
              datetime: z.string().optional().describe('dd-MM-yyyy or ISO; default now'),
              idempotency_key: z.string().nullish(),
              is_future: z
                .boolean()
                .optional()
                .describe('Create as a future/scheduled transaction (default false) — invisible to balances until converted'),
              tags: z.array(z.string()).optional().describe('Tags (ids or names) to file this item under'),
              line_items: lineItemShape,
            }),
          )
          .min(1)
          .max(50),
        force: z.boolean().optional().describe('Skip the per-item near-duplicate guard'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const [heads, assets, tag_catalog] = await Promise.all([
        load_heads(uid),
        load_assets(),
        args.transactions.some(t => t.tags?.length) ? load_tags(uid) : Promise.resolve([]),
      ])
      const built: BulkTransactionInput[] = args.transactions.map((t, i) => {
        try {
          return {
            datetime: parse_date(t.datetime),
            description: t.description,
            idempotency_key: t.idempotency_key,
            is_future: t.is_future,
            tag_ids: t.tags?.map(g => resolve_ref(g, tag_catalog, 'transaction tag').id),
            line_items: t.line_items.map((li): CreateLineItemInput => ({
              accounting_head_id: resolve_ref(li.head ?? li.account!, heads, 'accounting head').id,
              asset_id: resolve_ref(li.asset, assets, 'asset').id,
              quantity: li.quantity ?? undefined,
              txn_value: li.txn_value,
              description: li.description,
              datetime: li.datetime ? parse_date(li.datetime) : undefined,
            })),
          }
        } catch (e) {
          throw new Error(`transaction ${i + 1}: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
      if (!args.force) {
        const hit = await find_first_bulk_duplicate(uid, built, heads)
        if (hit)
          return error_text(
            `Possible duplicate at transaction ${hit.index + 1} — nothing was created. Existing transaction ${hit.dupe.id} (${ist_datetime(hit.dupe.datetime)} IST, "${hit.dupe.description ?? ''}") already moves ${hit.dupe.amount} on the same account within ±1 day. Pass force:true to create anyway, or give each item an idempotency_key.`,
          )
      }
      const res = await create_transactions_core(uid, built)
      if (!res.success) return action_result(res)
      const balances = await account_balances_for(
        uid,
        built.flatMap(b => b.line_items.map(li => li.accounting_head_id)),
        { heads, assets },
      )
      return text({ ok: true, message: res.message, ...res.data, account_balances: balances })
    },
  )

  server.registerTool(
    'validate_my_transactions',
    {
      description:
        'Integrity check: re-run the balancing invariant over every transaction in your ledger and report the ones that fail. Useful after bulk edits or imports; a healthy ledger returns an empty list.',
      inputSchema: {},
    },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      // This scans the whole ledger — select only the fields the invariant reads
      // rather than dragging every full head/asset row across the wire.
      const txns = await prisma.transaction.findMany({
        where: { user_id: uid },
        select: {
          id: true,
          datetime: true,
          description: true,
          line_items: {
            select: {
              quantity: true,
              txn_value: true,
              accounting_head: { select: { type: true } },
              asset: { select: { id: true, type: true, name: true } },
            },
          },
        },
      })
      const invalid: { id: string; datetime: Date; description: string | null; message: string }[] = []
      for (const txn of txns) {
        // validate_line_items structurally reads exactly the selected fields; its
        // declared parameter type is just wider (full Prisma payload rows).
        const { is_valid, message } = validate_line_items(txn.line_items as unknown as Parameters<typeof validate_line_items>[0])
        if (!is_valid) invalid.push({ id: txn.id, datetime: txn.datetime, description: txn.description, message })
      }
      return text({ checked: txns.length, invalid })
    },
  )

  server.registerTool(
    'cancel_request',
    {
      description:
        'Cancel your own outgoing pending request (one from list_requests outbox). If an approved version existed before your change, your copy reverts to it; a request from a brand-new transaction is simply withdrawn. This affects the shared state with the counterparty.',
      inputSchema: { link_id: z.string() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await cancel_request_core(uid, args.link_id))
    },
  )

  server.registerTool(
    'revert_request',
    {
      description:
        'Resolve a rejection: after the counterparty rejected your change (status "rejected" in list_requests inbox), rebuild your copy back to the last approved version. Mirrored lines are server-derived; balance your side via account (id or name) or explicit balancing_lines.',
      inputSchema: {
        link_id: z.string(),
        account: z.string().nullish().describe('Your own (non-linked) account to auto-balance onto'),
        balancing_lines: lineItemShape.optional().describe('Alternative to account: your own explicit balancing line items'),
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
      return action_result(await revert_request_core(uid, args.link_id, balancing, account_id))
    },
  )

  server.registerTool(
    'accept_all_from',
    {
      description:
        'Approve every pending change request from one counterparty in a single shot, auto-balancing each onto the given account of yours. Equivalent to approving them one by one — the counterparty sees all of them accepted.',
      inputSchema: {
        // `from` means a start date in every other tool — name the counterparty
        // arg distinctly, but keep the old spelling working.
        from_user: z.string().optional().describe('Counterparty username (or user id, e.g. other_id from list_requests)'),
        from: z.string().optional().describe('Deprecated alias of from_user — this is a username, never a date'),
        account: z.string().describe('Your own (non-linked) account to balance every approved copy onto'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const counterparty = args.from_user ?? args.from
      if (!counterparty) return error_text('Give the counterparty as from_user (a username, not a date)')
      const cp = await resolve_counterparty(uid, counterparty)
      const own = (await load_heads(uid)).filter(h => h.type === 'account' && !h.linked_user_id)
      const account_id = resolve_ref(args.account, own, 'account').id
      return action_result(await accept_all_from_core(uid, cp.id, account_id))
    },
  )

  server.registerTool(
    'find_user',
    {
      description: 'Look up another user by exact username (e.g. before linking an account with create_head/update_head). Returns their id.',
      inputSchema: { username: z.string() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await find_user_by_username_core(uid, args.username))
    },
  )

  server.registerTool(
    'notify_linked_user',
    {
      description:
        'Send a push notification to a user you share a linked account with (e.g. a nudge to review a pending request). Only works for users linked to one of your account heads; rate limited to 5 per 10 minutes per user. Confirm the wording with the user first — it lands on the other person\'s phone as "Message from @<you>". Returns accepted (devices whose push service took it — not proof it was shown; delivered is the same number, kept for compatibility) and sent_datetime; to learn whether it was actually shown or tapped, call list_sent_notifications a little later.',
      inputSchema: {
        user: z.string().describe('Their username (as find_user / linked heads show it) or user id'),
        message: z.string().describe('Plain text, max 500 characters'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = await prisma.user.findFirst({ where: { OR: [{ username: args.user }, { id: args.user }] }, select: { id: true } })
      if (!target) return error_text(`Error [NOT_FOUND]: No user "${args.user}"`)
      return action_result(await notify_linked_user_core(uid, target.id, args.message))
    },
  )

  server.registerTool(
    'list_sent_notifications',
    {
      description:
        'Push notifications you caused on other people\'s devices — approval requests (request_pending), rejections (request_rejected) and nudges (message) — newest first, each with how far it got: accepted (the push service took it), delivered (shown on a device), opened (tapped), failed, or in_flight. One row per push, rolled up across the recipient\'s devices. Pass link_id (from list_requests / get_transaction links) to ask "did they get notified about this request?". Kept 30 days; a device only reports delivered/opened once it has loaded the current app version.',
      inputSchema: {
        to: z.string().optional().describe('Only pushes to this user (username or id)'),
        kind: z.enum(['request_pending', 'request_rejected', 'message']).optional(),
        link_id: z.string().optional().describe('Only the push about this approval request'),
        limit: z.number().int().positive().max(100).optional().describe('Default 20'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      let to_user_id: string | undefined
      if (args.to) {
        const target = await prisma.user.findFirst({ where: { OR: [{ username: args.to }, { id: args.to }] }, select: { id: true } })
        if (!target) return error_text(`Error [NOT_FOUND]: No user "${args.to}"`)
        to_user_id = target.id
      }
      return action_result(await list_sent_notifications_core(uid, { to_user_id, kind: args.kind, link_id: args.link_id, limit: args.limit }))
    },
  )

  server.registerTool(
    'add_attachment',
    {
      description:
        'Attach a SMALL file to a transaction inline (a note, a JSON extract, a tiny image) — up to 64 KB. For a PDF, photo or anything larger, do NOT base64 it here: call request_attachment_upload instead and PUT the bytes, which is both faster and safer. Provide the content as UTF-8 text (content_text — for .txt/.json) or base64 (content_base64). Allowed types: jpeg/png/gif/webp/heic images, pdf, plain text, json. content_type is inferred from the filename extension when omitted.',
      inputSchema: {
        id: z.string().optional().describe('Transaction id (same arg name as get_transaction/update_transaction/delete_transaction)'),
        transaction_id: z.string().optional().describe('Alias of id'),
        filename: z.string(),
        content_text: z.string().optional().describe('UTF-8 file content (use for text/JSON)'),
        content_base64: z.string().optional().describe('Base64 file content (use for images/PDF)'),
        content_type: z.string().optional().describe('MIME type; inferred from the filename extension when omitted'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const txn_id = args.id ?? args.transaction_id
      if (!txn_id) return error_text('Give the transaction as id')
      const tx = await prisma.transaction.findFirst({ where: { id: txn_id, user_id: uid }, select: { id: true } })
      if (!tx) return error_text('Transaction not found')
      if ((args.content_text == null) === (args.content_base64 == null)) return error_text('Provide exactly one of content_text or content_base64')
      const ext = args.filename.split('.').pop()?.toLowerCase() ?? ''
      const content_type = args.content_type ?? ATTACHMENT_TYPE_BY_EXT[ext]
      if (!content_type || !ALLOWED_ATTACHMENT_TYPES.has(content_type))
        return error_text(`Unsupported attachment type "${content_type ?? ext}" — allowed: ${[...ALLOWED_ATTACHMENT_TYPES].join(', ')}`)
      const body = args.content_text != null ? Buffer.from(args.content_text, 'utf8') : Buffer.from(args.content_base64!, 'base64')
      if (body.length === 0) return error_text('Attachment content is empty')
      // Past this size the base64 has to be emitted by the model itself, where a
      // single wrong character yields a corrupt file that still uploads cleanly.
      // Send the caller to the upload-URL flow rather than let that happen.
      if (body.length > MAX_INLINE_ATTACHMENT_BYTES)
        return error_text(
          `Too large to attach inline (${Math.round(body.length / 1024)} KB; the inline limit is ${MAX_INLINE_ATTACHMENT_BYTES / 1024} KB). ` +
            `Call request_attachment_upload with this id and filename, then PUT the file to the URL it returns.`,
        )
      const checked = verify_attachment_bytes(body, content_type)
      if (!checked.ok) return error_text(checked.error)
      if (!env.BLOB_READ_WRITE_TOKEN) return error_text('Blob storage is not configured on this server')
      const blob = await put(`attachments/${Date.now()}-${args.filename}`, body, { access: 'private', contentType: checked.content_type })
      const att = await prisma.transaction_attachment.create({
        data: {
          transaction_id: tx.id,
          url: blob.url,
          pathname: blob.pathname,
          filename: args.filename,
          content_type: checked.content_type,
          size: body.length,
        },
      })
      audit('attachment.save', uid, { attachment_count: 1, surface: 'mcp' })
      return text({ ok: true, attachment_id: att.id, message: 'Attachment saved' })
    },
  )

  server.registerTool(
    'request_attachment_upload',
    {
      description:
        'Start attaching a LARGE file (PDF, photo, scan) to a transaction. Returns a one-time URL; PUT the file bytes to it and the attachment is saved — the file never passes through this conversation, so nothing is transcribed and nothing can be corrupted. Run the returned curl_command as-is. The URL works once and expires in 10 minutes. For content under 64 KB that you already have as text, add_attachment is simpler.',
      inputSchema: {
        id: z.string().optional().describe('Transaction id (same arg name as get_transaction/update_transaction/delete_transaction)'),
        transaction_id: z.string().optional().describe('Alias of id'),
        filename: z.string().describe('Name to store the file under, e.g. Contract_Note_15-Sep-2026.pdf'),
        file_path: z.string().optional().describe('Local path to the file, used only to build curl_command for you — the server never reads it'),
        content_type: z.string().optional().describe('MIME type; inferred from the filename extension when omitted'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const txn_id = args.id ?? args.transaction_id
      if (!txn_id) return error_text('Give the transaction as id')
      const tx = await prisma.transaction.findFirst({ where: { id: txn_id, user_id: uid }, select: { id: true } })
      if (!tx) return error_text('Transaction not found')

      const ext = args.filename.split('.').pop()?.toLowerCase() ?? ''
      const content_type = args.content_type ?? ATTACHMENT_TYPE_BY_EXT[ext]
      if (!content_type || !ALLOWED_ATTACHMENT_TYPES.has(content_type))
        return error_text(`Unsupported attachment type "${content_type ?? ext}" — allowed: ${[...ALLOWED_ATTACHMENT_TYPES].join(', ')}`)

      if (!env.BLOB_READ_WRITE_TOKEN) return error_text('Blob storage is not configured on this server')

      const origin = get_origin(extra as ToolExtra)
      if (!origin) return error_text('Could not determine this server origin — use add_attachment for small files instead')

      const { token, expires_at } = await create_upload_grant({
        user_id: uid,
        transaction_id: tx.id,
        filename: args.filename,
        content_type,
      })
      const upload_url = `${origin}/api/mcp/upload/${token}`
      const local = args.file_path ?? `/path/to/${args.filename}`

      audit('attachment.upload_requested', uid, { surface: 'mcp' })
      return text({
        upload_url,
        method: 'PUT',
        curl_command: `curl -sS -X PUT --data-binary @'${local}' -H 'Content-Type: ${content_type}' '${upload_url}'`,
        filename: args.filename,
        content_type,
        max_bytes: MAX_ATTACHMENT_BYTES,
        expires_at,
        expires_in_seconds: UPLOAD_TOKEN_TTL_MS / 1000,
        next: 'Run curl_command. It prints the saved attachment_id on success; no further tool call is needed.',
      })
    },
  )

  server.registerTool(
    'get_attachment',
    {
      description:
        'Fetch an attachment by id (ids come from get_transaction). Text/JSON attachments return their content inline; images return an image block; other types (e.g. PDF) return metadata only — view those in the web app.',
      inputSchema: { attachment_id: z.string() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const att = await owned_attachment(uid, args.attachment_id)
      if (!att) return error_text('Attachment not found')
      const meta = { id: att.id, filename: att.filename, content_type: att.content_type, size: att.size, created_at: att.created_at }
      const is_image = att.content_type?.startsWith('image/') ?? false
      const is_text = att.content_type === 'text/plain' || att.content_type === 'application/json'
      if (!is_image && !is_text) return text({ ...meta, note: 'Inline preview not supported for this type — open the transaction in the web app' })
      if ((att.size ?? 0) > 5 * 1024 * 1024) return text({ ...meta, note: 'Too large to return inline' })
      const url = blob_fetch_url(att.url, att.pathname)
      if (!url || !env.BLOB_READ_WRITE_TOKEN) return error_text('Attachment blob is not reachable')
      const resp = await fetch(url, { headers: { authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } })
      if (!resp.ok) return error_text(`Blob fetch failed (${resp.status})`)
      const buf = Buffer.from(await resp.arrayBuffer())
      if (is_text) {
        const full = buf.toString('utf8')
        const clipped = full.length > 100_000 ? `${full.slice(0, 100_000)}\n… [truncated]` : full
        return {
          content: [
            { type: 'text', text: JSON.stringify(meta, null, 2) },
            { type: 'text', text: clipped },
          ],
        } satisfies Content
      }
      return {
        content: [
          { type: 'text', text: JSON.stringify(meta, null, 2) },
          { type: 'image', data: buf.toString('base64'), mimeType: att.content_type! },
        ],
      } satisfies Content
    },
  )

  server.registerTool(
    'delete_attachment',
    {
      description: 'Permanently delete an attachment (the file and its record). The transaction itself is unaffected.',
      inputSchema: { attachment_id: z.string() },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const att = await owned_attachment(uid, args.attachment_id)
      if (!att) return error_text('Attachment not found')
      await del(att.url)
      await prisma.transaction_attachment.delete({ where: { id: att.id } })
      audit('attachment.delete', uid, { surface: 'mcp' })
      return text({ ok: true, message: 'Attachment deleted' })
    },
  )

  server.registerTool(
    'get_tax_computation',
    {
      description:
        'New-regime income tax computation for a financial year, computed live from the user\'s income/expense heads (never stored — backdating a transaction moves it). Defaults to the current financial year; pass fy as the start year ("2026") or a range ("2026-27"). Use this for tax liability rather than summing heads by hand. Returns the full computation (salary, standard deduction, interest, capital-gain heads, §87A rebate, cess, credits), the per-head breakdown backing each line, and any unclassified heads (non-zero net) that are being excluded — classify those with update_head tax_treatment before trusting the number.',
      inputSchema: {
        fy: z.string().optional().describe('Financial year as a start year "2026" or range "2026-27"; default current'),
        include_future: z
          .boolean()
          .optional()
          .describe(
            "Fold scheduled (is_future) transactions in, turning the year-to-date figure into a full-year projection built from the user's own forecast. Default false. Only meaningful if the rest of the year is actually scheduled — check per_head against expectations before relying on it.",
          ),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const fy = args.fy ? parse_fy(args.fy) : current_financial_year(new Date())
      if (fy === null) return error_text(`Unrecognised financial year "${args.fy}" — use a start year like 2026 or a range like "2026-27"`)
      const include_future = args.include_future ?? false
      const serialized = serialize_tax_result(await compute_tax_for_fy(uid, fy, include_future))
      return text({
        fy,
        fy_label: fy_label(fy),
        include_future,
        basis: include_future ? 'projected — includes scheduled transactions' : 'year to date — actuals only',
        computation: serialized.computation,
        per_head: serialized.per_head,
        unclassified_heads: serialized.unclassified_heads,
        unclassified_total: serialized.unclassified_heads.reduce((s, h) => s + h.net, 0),
        // Only warn when there is something to warn about — a standing caveat on a
        // fully classified year trains the reader to ignore it on the year that isn't.
        ...(serialized.unclassified_heads.length
          ? {
              note: 'total_income excludes the unclassified_heads listed above — classify them with update_head tax_treatment before trusting the number',
            }
          : {}),
      })
    },
  )

  server.registerTool(
    'get_settings',
    {
      description:
        'Your account settings: username, admin flag, UPI ID, UI preferences (theme, value masking, dashboard graphs) and the default heads/asset used to prefill new transactions (record_payment debits the default account).',
      inputSchema: {},
    },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return text(await settings_payload(uid))
    },
  )

  server.registerTool(
    'update_settings',
    {
      description:
        'Update settings — pass only the fields to change. Defaults and upi_id accept the string "none" to clear. default_account/allocation/income_expense/asset (id or name) prefill new transactions; record_payment debits the default account.',
      inputSchema: {
        theme: z.enum(['light', 'dark', 'system']).optional(),
        masking_enabled: z.boolean().optional().describe('Mask large values in the UI'),
        mask_threshold: z.number().int().nonnegative().optional().describe('Mask values at or above this many rupees'),
        graphs_visible: z.boolean().optional().describe('Show value-over-time graphs in the UI'),
        upi_id: z.string().optional().describe('Your own UPI handle like name@bank ("none" clears it)'),
        default_account: z.string().optional().describe('Account head id or name ("none" clears)'),
        default_allocation: z.string().optional().describe('Allocation head id or name ("none" clears)'),
        default_income_expense: z.string().optional().describe('Income/expense head id or name ("none" clears)'),
        default_asset: z.string().optional().describe('Asset id or name ("none" clears)'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)

      // Resolve every name reference before writing anything, so a bad ref
      // can't leave the settings half-applied.
      const wants_defaults =
        args.default_account !== undefined ||
        args.default_allocation !== undefined ||
        args.default_income_expense !== undefined ||
        args.default_asset !== undefined
      let next_defaults: Awaited<ReturnType<typeof get_line_item_defaults_core>> | null = null
      if (wants_defaults) {
        const [current, heads, assets] = await Promise.all([get_line_item_defaults_core(uid), load_heads(uid), load_assets()])
        const pick = (ref: string, type: 'account' | 'allocation' | 'income_expense') =>
          ref === 'none'
            ? null
            : resolve_ref(
                ref,
                heads.filter(h => h.type === type),
                `${type} head`,
              ).id
        next_defaults = {
          default_account_id: args.default_account !== undefined ? pick(args.default_account, 'account') : current.default_account_id,
          default_allocation_id: args.default_allocation !== undefined ? pick(args.default_allocation, 'allocation') : current.default_allocation_id,
          default_income_expense_id:
            args.default_income_expense !== undefined ? pick(args.default_income_expense, 'income_expense') : current.default_income_expense_id,
          default_asset_id:
            args.default_asset !== undefined
              ? args.default_asset === 'none'
                ? null
                : resolve_ref(args.default_asset, assets, 'asset').id
              : current.default_asset_id,
        }
      }

      const prefs_patch: Partial<UserPreferences> = {}
      if (args.theme !== undefined) prefs_patch.theme = args.theme
      if (args.masking_enabled !== undefined) prefs_patch.masking_enabled = args.masking_enabled
      if (args.mask_threshold !== undefined) prefs_patch.mask_threshold = args.mask_threshold
      if (args.graphs_visible !== undefined) prefs_patch.graphs_visible = args.graphs_visible
      if (Object.keys(prefs_patch).length > 0) {
        const res = await update_user_preferences_core(uid, prefs_patch)
        if (!res.success) return action_result(res)
      }

      if (args.upi_id !== undefined) {
        const res = await update_own_upi_core(uid, args.upi_id === 'none' ? null : args.upi_id)
        if (!res.success) return action_result(res)
      }

      if (next_defaults) {
        const res = await update_line_item_defaults_core(uid, next_defaults)
        if (!res.success) return action_result(res)
      }

      return text({ ok: true, message: 'Settings saved', settings: await settings_payload(uid) })
    },
  )

  // ---------------------------------------------------------------------------
  // Transaction tags — user-defined labels over whole transactions. Purely
  // descriptive: nothing here moves a balance, so none of these tools needs the
  // post-write balance echo the transaction tools carry.
  // ---------------------------------------------------------------------------

  server.registerTool(
    'list_tags',
    {
      description:
        'List the user\'s transaction tags with what each adds up to: count of real members, net / money-out / money-in in INR (ledger convention: spending negative), plus future_count for scheduled members, which are counted but never added into the totals. A tag is a label the user hangs on whole transactions ("Eating out", "Goa trip") — it changes no balance and belongs to this user alone (a linked counterparty never sees it). Use this before create_transaction/update_transaction so you can file an entry under a tag the user already has instead of inventing one.',
      inputSchema: {},
    },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return text(await list_transaction_tags_core(uid))
    },
  )

  server.registerTool(
    'get_tag',
    {
      description:
        'One transaction tag (id or name) with its totals and the transactions in it, newest first. Same net figure per row as list_transactions (signed sum over the account lines: negative = money out). Scheduled (future) members carry is_future and are excluded from the summary totals.',
      inputSchema: {
        tag: z.string().describe('Tag id or name'),
        limit: z.number().int().positive().max(500).optional().describe('Max transactions returned (default 100). Totals always cover the whole tag'),
        offset: z.number().int().nonnegative().optional().describe('Skip this many transactions (newest first)'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = resolve_ref(args.tag, await load_tags(uid), 'transaction tag')
      const tag = await get_transaction_tag_core(uid, target.id, { limit: args.limit ?? 100, offset: args.offset })
      if (!tag) return error_text('Tag not found')
      return text(tag)
    },
  )

  server.registerTool(
    'create_tag',
    {
      description:
        'Create a transaction tag — a label for bundling similar transactions ("Eating out", "Goa trip"). Names are unique per user, case-insensitively. This creates only the label; put transactions in it with add_transactions_to_tag, or with the tags arg on create_transaction/update_transaction.',
      inputSchema: { name: z.string(), description: z.string().nullish().describe('Optional note about what belongs in the tag') },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await create_transaction_tag_core(uid, { name: args.name, description: args.description }))
    },
  )

  server.registerTool(
    'update_tag',
    {
      description: 'Rename a transaction tag or change its description. Membership is untouched.',
      inputSchema: {
        tag: z.string().describe('Tag id or name'),
        name: z.string().optional().describe('New name'),
        description: z.string().nullish().describe('New description; pass null to clear it'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = resolve_ref(args.tag, await load_tags(uid), 'transaction tag')
      return action_result(await update_transaction_tag_core(uid, target.id, { name: args.name, description: args.description }))
    },
  )

  server.registerTool(
    'delete_tag',
    {
      description:
        'Delete a transaction tag. This removes only the label — every transaction that was in it stays exactly as it is, and no balance moves. The membership rows cascade away with it.',
      inputSchema: { tag: z.string().describe('Tag id or name') },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = resolve_ref(args.tag, await load_tags(uid), 'transaction tag')
      return action_result(await delete_transaction_tag_core(uid, target.id))
    },
  )

  server.registerTool(
    'add_transactions_to_tag',
    {
      description:
        'Put existing transactions into a tag. Already-member transactions are skipped rather than failing, so this is safe to re-run. Use this to backfill a new tag over history found with list_transactions / find_similar_transactions.',
      inputSchema: {
        tag: z.string().describe('Tag id or name'),
        transaction_ids: z.array(z.string()).min(1).max(500).describe('Transaction ids (from list_transactions / find_similar_transactions)'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = resolve_ref(args.tag, await load_tags(uid), 'transaction tag')
      return action_result(await add_transactions_to_tag_core(uid, target.id, args.transaction_ids))
    },
  )

  server.registerTool(
    'remove_transactions_from_tag',
    {
      description: 'Take transactions out of a tag. The transactions themselves are not touched.',
      inputSchema: {
        tag: z.string().describe('Tag id or name'),
        transaction_ids: z.array(z.string()).min(1).max(500),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const target = resolve_ref(args.tag, await load_tags(uid), 'transaction tag')
      return action_result(await remove_transactions_from_tag_core(uid, target.id, args.transaction_ids))
    },
  )

  server.registerTool(
    'set_transaction_tags',
    {
      description:
        "REPLACE one transaction's whole tag membership (ids or names); pass [] to take it out of every tag. Equivalent to update_transaction's tags arg, but without touching anything else about the transaction.",
      inputSchema: {
        id: z.string().describe('Transaction id'),
        tags: z.array(z.string()).describe('The complete set of tags it should be in (ids or names). [] clears them all'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const catalog = args.tags.length > 0 ? await load_tags(uid) : []
      const ids = args.tags.map(g => resolve_ref(g, catalog, 'transaction tag').id)
      return action_result(await set_transaction_tags_core(uid, args.id, ids))
    },
  )
}
