import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { toDecimal } from '@/app/_utils/decimal'
import { find_user_by_username_core } from '@/app/_core/resources_core'
import { compute_balances_core } from '@/app/_core/balances_core'
import type { ActionResult } from '@/app/_actions/_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

export type ToolExtra = { authInfo?: { extra?: { userId?: string } } }

export function get_uid(extra: ToolExtra): string {
  const uid = extra.authInfo?.extra?.userId
  if (typeof uid !== 'string') throw new Error('Unauthorized')
  return uid
}

export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export type Content = { content: ContentBlock[]; isError?: boolean }

export function text(value: unknown): Content {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

export function error_text(message: string): Content {
  return { content: [{ type: 'text', text: message }], isError: true }
}

export function action_result(res: ActionResult<unknown>): Content {
  if (res.success) return text({ ok: true, message: res.message ?? 'Done', ...(res.data ? { data: res.data } : {}) })
  return error_text(`Error [${res.code}]: ${res.message}`)
}

export const load_heads = (uid: string) =>
  prisma.accounting_head.findMany({
    where: { user_id: uid },
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, is_active: true, linked_user_id: true, parent_id: true },
  })

export const load_assets = () =>
  prisma.asset.findMany({
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, ticker: true, is_active: true, parent_id: true },
  })

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

export function resolve_ref<T extends { id: string; name: string; type?: string; is_active?: boolean }>(ref: string, list: T[], kind: string): T {
  const r = ref.trim()
  const byId = list.find(x => x.id === r)
  if (byId) return byId
  const byName = list.find(x => x.name.toLowerCase() === r.toLowerCase())
  if (byName) return byName
  const partial = list.filter(x => x.is_active !== false && x.name.toLowerCase().includes(r.toLowerCase()))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) throw new Error(`Ambiguous ${kind} "${ref}" — matches ${partial.map(x => x.name).join(', ')}. Use the exact name or id.`)
  throw new Error(`No ${kind} matching "${ref}". Valid options — ${format_candidates(list)}`)
}

export function net_account_flow(
  line_items: { accounting_head: { type: string }; quantity: Prisma.Decimal | null; txn_value: Prisma.Decimal | null }[],
): number {
  const n = line_items
    .filter(li => li.accounting_head.type === 'account')
    .reduce((s, li) => s + (li.txn_value?.toNumber() ?? li.quantity?.toNumber() ?? 0), 0)
  return Math.round(n * 100) / 100
}

export function parse_date(s?: string): Date {
  if (!s) return new Date()
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return get_date_obj_from_indian_date(s)
  const d = new Date(s)
  if (isNaN(d.getTime())) throw new Error(`Invalid date "${s}" — use dd-MM-yyyy or ISO`)
  return d
}

// Day-precision date for range filters: accepts dd-MM-yyyy or yyyy-MM-dd
// (optionally with a time suffix, which is ignored) and returns IST midnight.
export function parse_day(s: string): Date {
  const t = s.trim()
  if (/^\d{2}-\d{2}-\d{4}$/.test(t)) return get_date_obj_from_indian_date(t)
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return get_date_obj_from_indian_date(`${m[3]}-${m[2]}-${m[1]}`)
  throw new Error(`Invalid date "${s}" — use dd-MM-yyyy or yyyy-MM-dd`)
}

export const lineItemShape = z
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
      datetime: z
        .string()
        .nullish()
        .describe('Optional per-line datetime override (dd-MM-yyyy or ISO) for when this leg settled on a different date (affects FIFO/XIRR)'),
      external_ref: z
        .string()
        .nullish()
        .describe('Bank/UPI ref of this specific money movement (account lines) — line items are the actual bank rows, so refs live here'),
    }),
  )
  .min(1, 'At least one line item is required')

export const templateLineItemShape = z
  .array(
    z.object({
      account: z.string().describe('Accounting head: exact id or name'),
      asset: z.string().describe('Asset: exact id or name'),
      quantity: z.number().nullish().describe('Optional prefill quantity — template lines need not balance'),
      txn_value: z.number().nullish().describe('Optional prefill rupee value (non-rupee assets only)'),
      description: z.string().nullish(),
    }),
  )
  .min(1, 'At least one line item is required')

type LineItemArg = {
  account: string
  asset: string
  quantity?: number | null
  txn_value?: number | null
  description?: string | null
  datetime?: string | null
  external_ref?: string | null
}

export async function build_line_items(uid: string, items: LineItemArg[]): Promise<CreateLineItemInput[]> {
  const [heads, assets] = await Promise.all([load_heads(uid), load_assets()])
  return items.map(li => ({
    accounting_head_id: resolve_ref(li.account, heads, 'account').id,
    asset_id: resolve_ref(li.asset, assets, 'asset').id,
    quantity: li.quantity ?? undefined,
    txn_value: li.txn_value,
    description: li.description,
    datetime: li.datetime ? parse_date(li.datetime) : undefined,
    external_ref: li.external_ref,
  }))
}

export function stored_lines_to_input(
  lines: {
    accounting_head_id: string
    asset_id: string
    quantity: Prisma.Decimal | null
    txn_value: Prisma.Decimal | null
    description: string | null
    datetime: Date | null
    external_ref: string | null
  }[],
): CreateLineItemInput[] {
  return lines.map(li => ({
    accounting_head_id: li.accounting_head_id,
    asset_id: li.asset_id,
    quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
    txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
    description: li.description,
    datetime: li.datetime,
    external_ref: li.external_ref,
  }))
}

export async function require_admin(uid: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: uid }, select: { is_admin: true } })
  if (!u?.is_admin) throw new Error('Admin only — the asset catalog is shared across all users, so only an admin user can modify it')
}

export async function resolve_counterparty(me: string, ref: string): Promise<{ id: string; username: string }> {
  const by_username = await find_user_by_username_core(me, ref)
  if (by_username.success) return by_username.data!
  if (by_username.code !== 'NOT_FOUND') throw new Error(by_username.message ?? 'Invalid user')
  const by_id = await prisma.user.findUnique({ where: { id: ref }, select: { id: true, username: true } })
  if (by_id && by_id.id !== me) return by_id
  throw new Error(`No user matching "${ref}" — pass their exact username`)
}

// The near-duplicate guard lives in transactions_core (shared with the web
// create form); re-exported here for the tool files.
export { find_possible_duplicate } from '@/app/_core/transactions_core'

// Post-write state: current balances of the given heads (account type only),
// so a mutating tool can echo the resulting balances in its response.
export async function account_balances_for(
  uid: string,
  head_ids: string[],
): Promise<{ account: string; asset: string; quantity: number; txn_value: number }[]> {
  const ids = [...new Set(head_ids)]
  if (ids.length === 0) return []
  const [heads, assets, { accountsToAssets }] = await Promise.all([load_heads(uid), load_assets(), compute_balances_core(uid)])
  const head_by_id = new Map(heads.map(h => [h.id, h]))
  const asset_by_id = new Map(assets.map(a => [a.id, a]))
  const rows: { account: string; asset: string; quantity: number; txn_value: number }[] = []
  for (const hid of ids) {
    const head = head_by_id.get(hid)
    if (!head || head.type !== 'account') continue
    for (const [aid, bal] of accountsToAssets.get(hid) ?? new Map<string, { qty: number; txn_value: number }>()) {
      rows.push({
        account: head.name,
        asset: asset_by_id.get(aid)?.name ?? aid,
        quantity: Math.round(bal.qty * 10000) / 10000,
        txn_value: Math.round(bal.txn_value * 100) / 100,
      })
    }
  }
  return rows
}

// Validate + normalize a proposed transaction without writing anything, echoing
// the server-derived remainder lines so the caller can confirm before creating.
export async function dry_run_check(uid: string, datetime: Date, line_items: CreateLineItemInput[], description?: string | null): Promise<Content> {
  const head_ids = [...new Set(line_items.map(li => li.accounting_head_id))]
  const asset_ids = [...new Set(line_items.map(li => li.asset_id))]
  const [heads, assets] = await Promise.all([
    prisma.accounting_head.findMany({ where: { id: { in: head_ids }, user_id: uid } }),
    prisma.asset.findMany({ where: { id: { in: asset_ids } } }),
  ])
  if (heads.length !== head_ids.length) return error_text('One or more accounts not found or do not belong to your user')
  if (assets.length !== asset_ids.length) return error_text('One or more assets not found')

  const enriched = line_items.map(li => ({
    quantity: toDecimal(li.quantity),
    txn_value: toDecimal(li.txn_value),
    asset: assets.find(a => a.id === li.asset_id)!,
    accounting_head: heads.find(h => h.id === li.accounting_head_id)!,
  }))
  const { is_valid, message } = validate_line_items(enriched)
  if (!is_valid) return error_text(`Dry run — validation failed: ${message}`)

  const normalized = normalize_line_items(enriched)
  return text({
    ok: true,
    dry_run: true,
    valid: true,
    message: 'Valid — nothing was written. Derived remainder values shown below.',
    datetime,
    description: description ?? null,
    line_items: normalized.map((li, i) => ({
      head: li.accounting_head.name,
      head_type: li.accounting_head.type,
      asset: li.asset.name,
      quantity: li.quantity.toNumber(),
      txn_value: li.asset.type === 'rupees' ? null : li.txn_value.toNumber(),
      derived: enriched[i].quantity === null || (li.asset.type !== 'rupees' && enriched[i].txn_value === null),
    })),
  })
}
