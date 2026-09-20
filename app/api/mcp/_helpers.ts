import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { formatInTimeZone } from 'date-fns-tz'
import { USER_TIMEZONE } from '@/lib/config'
import { get_date_obj_from_indian_date, get_indian_date_from_date_obj } from '@/app/_utils/date'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { find_locked_line } from '@/app/_utils/lock_date'
import { normalize_line_items } from '@/app/_utils/normalize_txn'
import { toDecimal } from '@/app/_utils/decimal'
import { find_user_by_username_core } from '@/app/_core/resources_core'
import { compute_balances_core } from '@/app/_core/balances_core'
import type { ActionResult } from '@/app/_actions/_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

export type ToolExtra = { authInfo?: { extra?: { userId?: string; origin?: string } } }

export function get_uid(extra: ToolExtra): string {
  const uid = extra.authInfo?.extra?.userId
  if (typeof uid !== 'string') throw new Error('Unauthorized')
  return uid
}

// Tool handlers run outside the request scope, so there is no headers() to read
// here. The public origin is captured once during bearer verification (see
// route.ts) and rides along on authInfo, which is how a tool can hand back an
// absolute URL for the caller to curl.
export function get_origin(extra: ToolExtra): string | null {
  const origin = extra.authInfo?.extra?.origin
  return typeof origin === 'string' && origin.length > 0 ? origin : null
}

export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
export type Content = { content: ContentBlock[]; isError?: boolean }

export function text(value: unknown): Content {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(annotate_ist(value), null, 2) }] }
}

// Every datetime we emit is a UTC instant; every datetime we accept is an IST
// day. An instant past 18:30Z therefore reads as the *previous* day to a caller
// that only sees the Z string — so a model summarising its own write, or
// round-tripping the date back into another call, silently slips a day. Pair
// each one with its IST rendering at the single point where tool output is
// serialised, so no individual tool can forget.
function annotate_ist(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(annotate_ist)
  if (value instanceof Date || value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = annotate_ist(v)
    const d = v instanceof Date ? v : typeof v === 'string' && ISO_INSTANT.test(v) ? new Date(v) : null
    if (d && (k === 'datetime' || k.endsWith('_datetime')) && !isNaN(d.getTime())) out[`${k}_ist`] = ist_datetime(d)
  }
  return out
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

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
    select: { id: true, name: true, type: true, is_active: true, linked_user_id: true, parent_id: true, lock_date: true, tax_treatment: true },
  })

export const load_assets = () =>
  prisma.asset.findMany({
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, ticker: true, is_active: true, parent_id: true },
  })

export const load_groups = (uid: string) =>
  prisma.transaction_group.findMany({ where: { user_id: uid }, orderBy: { name: 'asc' }, select: { id: true, name: true } })

export type GroupsCatalog = Awaited<ReturnType<typeof load_groups>>

/**
 * Turn a list of group ids/names into ids, the same id-or-name resolution every
 * other ref arg gets. `undefined` stays undefined so the caller can tell "leave
 * the groups alone" apart from "clear them" ([]).
 */
export async function resolve_group_refs(uid: string, refs: string[] | undefined, preloaded?: GroupsCatalog): Promise<string[] | undefined> {
  if (refs === undefined) return undefined
  if (refs.length === 0) return []
  const catalog = preloaded ?? (await load_groups(uid))
  return refs.map(r => resolve_ref(r, catalog, 'transaction group').id)
}

export type HeadsCatalog = Awaited<ReturnType<typeof load_heads>>
export type AssetsCatalog = Awaited<ReturnType<typeof load_assets>>
// Per-invocation reuse of already-loaded catalogs — never cache these across requests.
export type PreloadedCatalogs = { heads?: HeadsCatalog; assets?: AssetsCatalog }

const MAX_CANDIDATES_PER_GROUP = 25

function cap(names: string[]): string {
  if (names.length <= MAX_CANDIDATES_PER_GROUP) return names.join(', ')
  return `${names.slice(0, MAX_CANDIDATES_PER_GROUP).join(', ')} … and ${names.length - MAX_CANDIDATES_PER_GROUP} more`
}

function format_candidates<T extends { name: string; type?: string; is_active?: boolean }>(list: T[]): string {
  const active = list.filter(x => x.is_active !== false)
  if (!active.some(x => x.type)) return cap(active.map(x => x.name)) || 'none'
  const groups = new Map<string, string[]>()
  for (const x of active) {
    const k = x.type ?? 'other'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(x.name)
  }
  return [...groups].map(([k, names]) => `${k}: ${cap(names)}`).join('; ') || 'none'
}

function edit_distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]
}

// A typo ("Grocieries") should come back as a suggestion, not as a wall of every
// name we hold — an agent can act on "did you mean", but has to guess from a list.
function nearest(ref: string, list: { name: string; is_active?: boolean }[]): string[] {
  const r = ref.trim().toLowerCase()
  const budget = Math.max(2, Math.floor(r.length / 3))
  return list
    .filter(x => x.is_active !== false)
    .map(x => ({ name: x.name, d: edit_distance(r, x.name.toLowerCase()) }))
    .filter(x => x.d <= budget)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5)
    .map(x => x.name)
}

export function resolve_ref<T extends { id: string; name: string; type?: string; is_active?: boolean }>(ref: string, list: T[], kind: string): T {
  const r = ref.trim()
  const byId = list.find(x => x.id === r)
  if (byId) return byId
  const byName = list.find(x => x.name.toLowerCase() === r.toLowerCase())
  if (byName) return byName
  const partial = list.filter(x => x.is_active !== false && x.name.toLowerCase().includes(r.toLowerCase()))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) throw new Error(`Ambiguous ${kind} "${ref}" — matches ${cap(partial.map(x => x.name))}. Use the exact name or id.`)
  const suggestions = nearest(r, list)
  const did_you_mean = suggestions.length ? ` Did you mean ${suggestions.join(', ')}?` : ''
  throw new Error(`No ${kind} matching "${ref}".${did_you_mean} Valid options — ${format_candidates(list)}`)
}

// Every datetime we emit is a UTC instant, but every datetime we accept is an
// IST day — so an instant after 18:30 UTC reads as the *previous* day to a
// caller that only sees the Z string. Pair the two so a model round-tripping a
// date back into a write can't slip a day.
export function ist_datetime(date: Date): string {
  return formatInTimeZone(date, USER_TIMEZONE, 'dd-MM-yyyy HH:mm')
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
      head: z.string().optional().describe('Accounting head: exact id or name (any type). Alias of account — give one or the other'),
      account: z.string().optional().describe('Same as head, kept for compatibility — an accounting head of any type, not just an account'),
      asset: z.string().describe('Asset: exact id or name'),
      quantity: z
        .number()
        .nullish()
        .describe(
          'Signed quantity. REQUIRED on every account head. On allocation heads omit it (or pass null) on exactly one line, and on income/expense heads on exactly one line — those are auto-derived as the balancing remainder.',
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
    }),
  )
  .min(1, 'At least one line item is required')
  .superRefine((items, ctx) => {
    items.forEach((li, i) => {
      if (!li.head && !li.account) ctx.addIssue({ code: 'custom', path: [i, 'head'], message: 'Give the accounting head as head (or account)' })
    })
  })

export const templateLineItemShape = z
  .array(
    z.object({
      head: z.string().optional().describe('Accounting head: exact id or name (any type). Alias of account — give one or the other'),
      account: z.string().optional().describe('Same as head, kept for compatibility'),
      asset: z.string().describe('Asset: exact id or name'),
      quantity: z.number().nullish().describe('Optional prefill quantity — template lines need not balance'),
      txn_value: z.number().nullish().describe('Optional prefill rupee value (non-rupee assets only)'),
      description: z.string().nullish(),
    }),
  )
  .min(1, 'At least one line item is required')
  .superRefine((items, ctx) => {
    items.forEach((li, i) => {
      if (!li.head && !li.account) ctx.addIssue({ code: 'custom', path: [i, 'head'], message: 'Give the accounting head as head (or account)' })
    })
  })

type LineItemArg = {
  head?: string
  account?: string
  asset: string
  quantity?: number | null
  txn_value?: number | null
  description?: string | null
  datetime?: string | null
}

export async function build_line_items(uid: string, items: LineItemArg[], preloaded?: PreloadedCatalogs): Promise<CreateLineItemInput[]> {
  const [heads, assets] = await Promise.all([preloaded?.heads ?? load_heads(uid), preloaded?.assets ?? load_assets()])
  return items.map(li => ({
    accounting_head_id: resolve_ref(li.head ?? li.account!, heads, 'accounting head').id,
    asset_id: resolve_ref(li.asset, assets, 'asset').id,
    quantity: li.quantity ?? undefined,
    txn_value: li.txn_value,
    description: li.description,
    datetime: li.datetime ? parse_date(li.datetime) : undefined,
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
  }[],
): CreateLineItemInput[] {
  return lines.map(li => ({
    accounting_head_id: li.accounting_head_id,
    asset_id: li.asset_id,
    quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
    txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
    description: li.description,
    datetime: li.datetime,
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

export { find_possible_duplicate } from '@/app/_core/transactions_core'

export async function account_balances_for(
  uid: string,
  head_ids: string[],
  preloaded?: PreloadedCatalogs,
): Promise<{ account: string; asset: string; quantity: number; txn_value: number }[]> {
  const ids = [...new Set(head_ids)]
  if (ids.length === 0) return []
  const [heads, assets, { accountsToAssets }] = await Promise.all([
    preloaded?.heads ?? load_heads(uid),
    preloaded?.assets ?? load_assets(),
    compute_balances_core(uid),
  ])
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

// old_state (updates only) is the transaction's current datetime + lines, so the
// dry run also predicts the real path's you-cannot-touch-a-locked-txn rejection.
// Mirrors update_transaction_core's two independent lock gates: the transaction's
// CURRENT state is only lock-checked while it's currently real (old_state.is_future
// false), and its NEW/replacement state is only lock-checked when it won't end up
// future (will_be_future false) — a create has no old_state, so only the latter applies.
export async function dry_run_check(
  uid: string,
  datetime: Date,
  line_items: CreateLineItemInput[],
  description?: string | null,
  old_state?: { datetime: Date; is_future: boolean; line_items: { datetime: Date | null; accounting_head_id: string }[] },
  will_be_future = false,
): Promise<Content> {
  const head_ids = [...new Set([...line_items, ...(old_state?.line_items ?? [])].map(li => li.accounting_head_id))]
  const asset_ids = [...new Set(line_items.map(li => li.asset_id))]
  const [heads, assets] = await Promise.all([
    prisma.accounting_head.findMany({ where: { id: { in: head_ids }, user_id: uid } }),
    prisma.asset.findMany({ where: { id: { in: asset_ids } } }),
  ])
  if (heads.length !== head_ids.length) return error_text('One or more accounts not found or do not belong to your user')
  if (assets.length !== asset_ids.length) return error_text('One or more assets not found')

  const to_lock_line = (li: { datetime?: Date | null; accounting_head_id: string }) => ({
    datetime: li.datetime,
    accounting_head: heads.find(h => h.id === li.accounting_head_id)!,
  })
  const locked =
    (old_state && !old_state.is_future ? find_locked_line(old_state.datetime, old_state.line_items.map(to_lock_line)) : null) ??
    (will_be_future ? null : find_locked_line(datetime, line_items.map(to_lock_line)))
  if (locked)
    return error_text(
      `Dry run — the real call would be rejected: account "${locked.head_name}" is reconciled and locked through ${get_indian_date_from_date_obj(locked.lock_date)}. Move the account's lock date back first if this change is intentional.`,
    )

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
