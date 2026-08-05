import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { put, del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { reconcile_ledger_core } from '@/app/_core/reconcile_core'
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
  text,
  error_text,
  action_result,
  load_heads,
  load_assets,
  resolve_ref,
  parse_date,
  parse_day,
  lineItemShape,
  templateLineItemShape,
  build_line_items,
  require_admin,
  resolve_counterparty,
  find_possible_duplicate,
  account_balances_for,
} from './_helpers'

const ro = { readOnlyHint: true } as const

const head_type_enum = z.enum(['account', 'allocation', 'income_expense'])
const asset_type_enum = z.enum(['rupees', 'mf', 'etf', 'shares', 'other'])

// Mirrors ALLOWED_TYPES in app/api/upload/route.ts
const ATTACHMENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  txt: 'text/plain',
  json: 'application/json',
}
const ALLOWED_ATTACHMENT_TYPES = new Set(Object.values(ATTACHMENT_TYPE_BY_EXT))
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

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
  // ---------- accounting heads ----------

  server.registerTool(
    'create_head',
    {
      description:
        'Create an accounting head: an account (bank/wallet/person/broker), allocation (bucket like Savings/Investments) or income_expense category. Optionally nest under a parent of the same type, or link an account head to another user by username — transactions touching a linked account then sync to that user for approval. Prefer reusing existing heads (list_heads / find_similar_transactions) over creating near-duplicates.',
      inputSchema: {
        name: z.string(),
        type: head_type_enum,
        parent: z.string().optional().describe('Parent head id or name (same type) to nest under'),
        linked_username: z.string().optional().describe('account type only: link to this user for cross-user sync'),
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
      const res = await create_account_core(uid, args.name, args.type, parent_id, linked_user_id)
      if (!res.success) return action_result(res)
      const created = await prisma.accounting_head.findFirst({ where: { user_id: uid, name: args.name.trim() }, select: { id: true } })
      return text({ ok: true, id: created?.id, message: 'Head created' })
    },
  )

  server.registerTool(
    'update_head',
    {
      description:
        'Update an accounting head: rename, move under a new parent (or clear_parent for top level), enable/disable via is_active (false archives it — hidden from pickers, history kept; this is the right way to retire a head), mark as placeholder (grouping-only), or link/unlink another user (accounts only; unlinking is blocked while shared transactions exist).',
      inputSchema: {
        head: z.string().describe('Head id or name'),
        name: z.string().optional(),
        parent: z.string().optional().describe('New parent head id or name (same type)'),
        clear_parent: z.boolean().optional().describe('Move to top level'),
        is_active: z.boolean().optional().describe('false = archive/disable, true = re-enable'),
        is_placeholder: z.boolean().optional().describe('Placeholder heads only group children'),
        linked_username: z.string().optional().describe('Link this account head to a user by username'),
        clear_linked_user: z.boolean().optional().describe('Remove the cross-user link'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const heads = await load_heads(uid)
      const target = resolve_ref(args.head, heads, 'accounting head')
      if (args.parent && args.clear_parent) return error_text('Give either parent or clear_parent, not both')
      if (args.linked_username && args.clear_linked_user) return error_text('Give either linked_username or clear_linked_user, not both')
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
        await update_account_core(uid, target.id, args.name, undefined, parent_id, args.is_active, args.is_placeholder, linked_user_id),
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

  // ---------- asset catalog (admin) ----------

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
      return action_result(await update_asset_core(target.id, args.name, args.type, ticker, parent_id, args.is_active, args.is_placeholder))
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
      return action_result(await delete_asset_core(target.id))
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
      return action_result(await reorder_assets_core(parent_id, ids))
    },
  )

  // ---------- transaction templates ----------

  server.registerTool(
    'list_templates',
    {
      description:
        'List saved transaction templates (reusable prefills for recurring entries like rent or salary). To use one, copy its line items into create_transaction, filling any omitted amounts.',
      inputSchema: {},
      annotations: ro,
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

  // ---------- bulk create & reconciliation ----------

  server.registerTool(
    'create_transactions',
    {
      description:
        'Create up to 50 transactions atomically — all commit or none do (one failure aborts the whole batch with the failing index). Same line-item rules as create_transaction. For statement imports set external_ref on each account line (or the per-item convenience field, which stamps the single account line) and idempotency_key per item: items whose key already exists are replayed (returned, not re-created), so re-running a partially failed import is safe. The near-duplicate guard runs per item without a key unless force is true. The response echoes the resulting balances of all touched accounts.',
      inputSchema: {
        transactions: z
          .array(
            z.object({
              description: z.string().nullish(),
              datetime: z.string().optional().describe('dd-MM-yyyy or ISO; default now'),
              external_ref: z.string().nullish().describe('Convenience: stamped onto the single account line; use per-line external_ref otherwise'),
              idempotency_key: z.string().nullish(),
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
      const [heads, assets] = await Promise.all([load_heads(uid), load_assets()])
      const built: BulkTransactionInput[] = args.transactions.map((t, i) => {
        try {
          return {
            datetime: parse_date(t.datetime),
            description: t.description,
            external_ref: t.external_ref,
            idempotency_key: t.idempotency_key,
            line_items: t.line_items.map(
              (li): CreateLineItemInput => ({
                accounting_head_id: resolve_ref(li.account, heads, 'account').id,
                asset_id: resolve_ref(li.asset, assets, 'asset').id,
                quantity: li.quantity ?? undefined,
                txn_value: li.txn_value,
                description: li.description,
                datetime: li.datetime ? parse_date(li.datetime) : undefined,
                external_ref: li.external_ref,
              }),
            ),
          }
        } catch (e) {
          throw new Error(`transaction ${i + 1}: ${e instanceof Error ? e.message : String(e)}`)
        }
      })
      if (!args.force) {
        for (let i = 0; i < built.length; i++) {
          if (built[i].idempotency_key) continue
          const dupe = await find_possible_duplicate(uid, built[i].datetime, built[i].line_items)
          if (dupe)
            return error_text(
              `Possible duplicate at transaction ${i + 1} — nothing was created. Existing transaction ${dupe.id} (${dupe.datetime.toISOString()}, "${dupe.description ?? ''}") already moves ${dupe.amount} on the same account within ±1 day. Pass force:true to create anyway, or give each item an idempotency_key.`,
            )
        }
      }
      const res = await create_transactions_core(uid, built)
      if (!res.success) return action_result(res)
      const balances = await account_balances_for(
        uid,
        built.flatMap(b => b.line_items.map(li => li.accounting_head_id)),
      )
      return text({ ok: true, message: res.message, ...res.data, account_balances: balances })
    },
  )

  server.registerTool(
    'find_by_external_ref',
    {
      description:
        'Check which external references (bank/UPI refs) already exist in the ledger. Refs live on line items — the actual bank rows — so each match reports the line item and its parent transaction. Use before importing a statement to skip already-recorded rows.',
      inputSchema: { refs: z.array(z.string().min(1)).min(1).max(500) },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const refs = [...new Set(args.refs)]
      const lines = await prisma.line_item.findMany({
        where: { external_ref: { in: refs }, transaction: { user_id: uid } },
        select: {
          id: true,
          external_ref: true,
          quantity: true,
          txn_value: true,
          datetime: true,
          transaction: { select: { id: true, datetime: true, description: true } },
        },
        orderBy: { transaction: { datetime: 'desc' } },
      })
      const by_ref = new Map<string, { transaction_id: string; line_item_id: string; datetime: Date; amount: number; description: string | null }[]>()
      for (const li of lines) {
        const list = by_ref.get(li.external_ref!) ?? []
        list.push({
          transaction_id: li.transaction.id,
          line_item_id: li.id,
          datetime: li.datetime ?? li.transaction.datetime,
          amount: li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0,
          description: li.transaction.description,
        })
        by_ref.set(li.external_ref!, list)
      }
      return text({
        matched: [...by_ref].map(([ref, flows]) => ({ ref, flows })),
        missing: refs.filter(r => !by_ref.has(r)),
      })
    },
  )

  server.registerTool(
    'reconcile',
    {
      description:
        "Reconcile bank-statement rows against one account head's individual line items — the atomic flows, so one transaction netting several bank events (wallet top-ups, refunds, splits) still matches row-by-row. Matching is one-to-one per line: first by ref against the parent transaction's external_ref (the amount check picks the right line when several share a ref), then by amount (±0.01) within ±1 day of the line's effective date. Amounts are signed in ledger convention: negative = money out of the account. Returns matched pairs (with transaction_id + line_item_id), ref matches whose amounts disagree, rows missing from the ledger (create them with create_transaction + external_ref + idempotency_key), ledger flows missing from the statement, and the ledger closing balance at the window end.",
      inputSchema: {
        account: z.string().describe('Account head id or name'),
        rows: z
          .array(
            z.object({
              date: z.string().describe('dd-MM-yyyy or yyyy-MM-dd'),
              amount: z.number().describe('Signed: negative = debit/money out'),
              ref: z.string().nullish().describe('Bank/UPI reference if present'),
              desc: z.string().nullish(),
            }),
          )
          .min(1)
          .max(1000),
        from: z.string().optional().describe('Ledger window start (default: earliest row date − 2 days)'),
        to: z.string().optional().describe('Ledger window end, inclusive (default: latest row date + 2 days)'),
      },
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const heads = await load_heads(uid)
      const head = resolve_ref(
        args.account,
        heads.filter(h => h.type === 'account'),
        'account',
      )
      const rows = args.rows.map(r => ({ date: parse_day(r.date), amount: r.amount, ref: r.ref ?? null, desc: r.desc ?? null }))
      let to_exclusive: Date | undefined
      if (args.to) {
        to_exclusive = parse_day(args.to)
        to_exclusive.setDate(to_exclusive.getDate() + 1)
      }
      const {
        from: fromDate,
        to_exclusive: toDate,
        flows,
        result,
        flow_by_id,
        closing_balance,
      } = await reconcile_ledger_core(uid, head.id, rows, { from: args.from ? parse_day(args.from) : undefined, to_exclusive })

      const echo_row = (i: number) => ({
        index: i,
        date: args.rows[i].date,
        amount: args.rows[i].amount,
        ref: args.rows[i].ref ?? null,
        desc: args.rows[i].desc ?? null,
      })
      return text({
        account: head.name,
        window: { from: fromDate, to_exclusive: toDate },
        counts: {
          bank_rows: rows.length,
          ledger_flows: flows.length,
          matched: result.matched.length,
          amount_mismatch: result.amount_mismatch.length,
          missing_in_ledger: result.missing_in_ledger.length,
          missing_in_bank: result.missing_in_bank.length,
        },
        matched: result.matched.map(m => {
          const f = flow_by_id.get(m.entry_id)!
          return { ...echo_row(m.row_index), transaction_id: f.transaction_id, line_item_id: f.line_item_id, matched_by: m.matched_by }
        }),
        amount_mismatch: result.amount_mismatch.map(m => {
          const f = flow_by_id.get(m.entry_id)!
          return { ...echo_row(m.row_index), transaction_id: f.transaction_id, line_item_id: f.line_item_id, ledger_delta: m.ledger_delta }
        }),
        missing_in_ledger: result.missing_in_ledger.map(echo_row),
        missing_in_bank: result.missing_in_bank.map(id => {
          const f = flow_by_id.get(id)!
          return {
            transaction_id: f.transaction_id,
            line_item_id: f.line_item_id,
            datetime: f.datetime,
            delta: f.amount,
            external_ref: f.external_ref,
            description: f.description,
          }
        }),
        ledger_closing_balance: closing_balance,
      })
    },
  )

  server.registerTool(
    'validate_my_transactions',
    {
      description:
        'Integrity check: re-run the balancing invariant over every transaction in your ledger and report the ones that fail. Useful after bulk edits or imports; a healthy ledger returns an empty list.',
      inputSchema: {},
      annotations: ro,
    },
    async (_args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const txns = await prisma.transaction.findMany({
        where: { user_id: uid },
        include: { line_items: { include: { accounting_head: true, asset: true } } },
      })
      const invalid: { id: string; datetime: Date; description: string | null; message: string }[] = []
      for (const txn of txns) {
        const { is_valid, message } = validate_line_items(txn.line_items)
        if (!is_valid) invalid.push({ id: txn.id, datetime: txn.datetime, description: txn.description, message })
      }
      return text({ checked: txns.length, invalid })
    },
  )

  // ---------- approvals (beyond approve/reject) ----------

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
        from: z.string().describe('Counterparty username (or user id, e.g. other_id from list_requests)'),
        account: z.string().describe('Your own (non-linked) account to balance every approved copy onto'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const cp = await resolve_counterparty(uid, args.from)
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
      annotations: ro,
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      return action_result(await find_user_by_username_core(uid, args.username))
    },
  )

  // ---------- attachments ----------

  server.registerTool(
    'add_attachment',
    {
      description:
        'Attach a file to a transaction (receipt, bill, statement extract). Provide the content as UTF-8 text (content_text — for .txt/.json) or base64 (content_base64 — for images/PDF). Allowed types: jpeg/png/gif/webp/heic images, pdf, plain text, json; max 10 MB. content_type is inferred from the filename extension when omitted.',
      inputSchema: {
        transaction_id: z.string(),
        filename: z.string(),
        content_text: z.string().optional().describe('UTF-8 file content (use for text/JSON)'),
        content_base64: z.string().optional().describe('Base64 file content (use for images/PDF)'),
        content_type: z.string().optional().describe('MIME type; inferred from the filename extension when omitted'),
      },
    },
    async (args, extra) => {
      const uid = get_uid(extra as ToolExtra)
      const tx = await prisma.transaction.findFirst({ where: { id: args.transaction_id, user_id: uid }, select: { id: true } })
      if (!tx) return error_text('Transaction not found')
      if ((args.content_text == null) === (args.content_base64 == null)) return error_text('Provide exactly one of content_text or content_base64')
      const ext = args.filename.split('.').pop()?.toLowerCase() ?? ''
      const content_type = args.content_type ?? ATTACHMENT_TYPE_BY_EXT[ext]
      if (!content_type || !ALLOWED_ATTACHMENT_TYPES.has(content_type))
        return error_text(`Unsupported attachment type "${content_type ?? ext}" — allowed: ${[...ALLOWED_ATTACHMENT_TYPES].join(', ')}`)
      const body = args.content_text != null ? Buffer.from(args.content_text, 'utf8') : Buffer.from(args.content_base64!, 'base64')
      if (body.length === 0) return error_text('Attachment content is empty')
      if (body.length > MAX_ATTACHMENT_BYTES) return error_text('Attachment too large (max 10 MB)')
      if (!env.BLOB_READ_WRITE_TOKEN) return error_text('Blob storage is not configured on this server')
      const blob = await put(`attachments/${Date.now()}-${args.filename}`, body, { access: 'private', contentType: content_type })
      const att = await prisma.transaction_attachment.create({
        data: { transaction_id: tx.id, url: blob.url, pathname: blob.pathname, filename: args.filename, content_type, size: body.length },
      })
      return text({ ok: true, attachment_id: att.id, message: 'Attachment saved' })
    },
  )

  server.registerTool(
    'get_attachment',
    {
      description:
        'Fetch an attachment by id (ids come from get_transaction). Text/JSON attachments return their content inline; images return an image block; other types (e.g. PDF) return metadata only — view those in the web app.',
      inputSchema: { attachment_id: z.string() },
      annotations: ro,
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
      return text({ ok: true, message: 'Attachment deleted' })
    },
  )

  // ---------- settings ----------

  server.registerTool(
    'get_settings',
    {
      description:
        'Your account settings: username, admin flag, UPI ID, UI preferences (theme, value masking, dashboard graphs) and the default heads/asset used to prefill new transactions (pay uses the default account).',
      inputSchema: {},
      annotations: ro,
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
        'Update settings — pass only the fields to change. Defaults and upi_id accept the string "none" to clear. default_account/allocation/income_expense/asset (id or name) prefill new transactions; pay debits the default account.',
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
}
