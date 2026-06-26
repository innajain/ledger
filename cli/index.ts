#!/usr/bin/env tsx
/**
 * `ledger` — terminal client for the triple-entry ledger. Talks to the SAME
 * core logic the web app uses (`app/_core/*`), so a transaction added here is
 * identical to one added in the browser (validation, cross-user approval links,
 * balance invalidation all included). Reads/writes whatever DATABASE_URL /
 * REDIS_URL point at — local by default; point them at prod to operate on prod.
 *
 * Run via: pnpm cli <command> [...]
 */
import 'dotenv/config'
import { parseArgs } from 'node:util'
import * as readline from 'node:readline'
import { Writable } from 'node:stream'
import { stdin, stdout } from 'node:process'

import { prisma } from '@/lib/prisma'
import { authenticate, sign_token } from '@/app/_core/auth_core'
import { compute_balances_core } from '@/app/_core/balances_core'
import { create_transaction_core, update_transaction_core, delete_transaction_core, type CreateLineItemInput } from '@/app/_core/transactions_core'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import type { ActionResult } from '@/app/_actions/_result'

import { save_token, clear_token, load_session, require_session } from './auth_store'
import { table, money, fmt_date } from './format'

// --- prompt helpers ----------------------------------------------------------
//
// We pull lines through readline's async iterator rather than repeated
// rl.question() calls: the iterator buffers lines, so it doesn't drop input
// when several lines arrive at once (e.g. piped/non-interactive stdin). Prompts
// are written straight to stdout; echo flows through `masked_out`, which we mute
// for password entry.

let muted = false
const masked_out = new Writable({
  write(chunk, _enc, cb) {
    if (!muted) stdout.write(chunk)
    cb()
  },
})

// Lazily created on first prompt so non-interactive paths (e.g. `add --json -`,
// which reads JSON straight from stdin) never claim stdin.
let rl: readline.Interface | undefined
let lines: AsyncIterableIterator<string> | undefined
function get_lines(): AsyncIterableIterator<string> {
  if (!lines) {
    rl = readline.createInterface({ input: stdin, output: masked_out, terminal: stdin.isTTY })
    lines = rl[Symbol.asyncIterator]()
  }
  return lines
}

async function ask(q: string): Promise<string> {
  stdout.write(q)
  const { value, done } = await get_lines().next()
  return done ? '' : value
}

async function ask_hidden(q: string): Promise<string> {
  stdout.write(q)
  const iter = get_lines()
  muted = true
  const { value, done } = await iter.next()
  muted = false
  stdout.write('\n')
  return done ? '' : value
}

async function confirm(q: string): Promise<boolean> {
  const a = (await ask(`${q} [y/N] `)).trim().toLowerCase()
  return a === 'y' || a === 'yes'
}

// --- shared loaders ----------------------------------------------------------

const load_heads = (uid: string) =>
  prisma.accounting_head.findMany({
    where: { user_id: uid },
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, is_active: true, linked_user_id: true },
  })

const load_assets = () =>
  prisma.asset.findMany({
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, ticker: true, is_active: true },
  })

/** Resolve a head/asset reference that may be a 1-based list index, an exact id, or a (case-insensitive) name. */
function resolve_ref<T extends { id: string; name: string }>(ref: string, list: T[], kind: string): T {
  const r = ref.trim()
  const asIndex = Number(r)
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= list.length) return list[asIndex - 1]
  const byId = list.find(x => x.id === r)
  if (byId) return byId
  const byName = list.find(x => x.name.toLowerCase() === r.toLowerCase())
  if (byName) return byName
  throw new Error(`No ${kind} matching "${ref}"`)
}

function print_result(res: ActionResult<unknown>): void {
  if (res.success) console.log(`✓ ${res.message ?? 'Done'}`)
  else {
    console.error(`✗ [${res.code}] ${res.message}`)
    process.exitCode = 1
  }
}

// --- commands ----------------------------------------------------------------

async function cmd_login() {
  const username = (await ask('Username: ')).trim()
  const password = await ask_hidden('Password: ')
  const user = await authenticate(username, password)
  if (!user) {
    console.error('✗ invalid credentials')
    process.exitCode = 1
    return
  }
  const token = await sign_token({ uid: user.id, username: user.username })
  await save_token(token)
  console.log(`✓ Logged in as ${user.username}`)
}

async function cmd_logout() {
  await clear_token()
  console.log('✓ Logged out')
}

async function cmd_whoami() {
  const s = await load_session()
  if (!s) {
    console.log('Not logged in.')
    return
  }
  console.log(`${s.username}  (${s.uid})`)
}

async function cmd_heads() {
  const { uid } = await require_session()
  const heads = await load_heads(uid)
  const rows = heads.map((h, i) => [String(i + 1), h.id, h.type, h.name + (h.is_active ? '' : ' (inactive)') + (h.linked_user_id ? ' 🔗' : '')])
  console.log(table(['#', 'id', 'type', 'name'], rows))
}

async function cmd_assets() {
  await require_session()
  const assets = await load_assets()
  const rows = assets.map((a, i) => [String(i + 1), a.id, a.type, a.ticker ?? '', a.name + (a.is_active ? '' : ' (inactive)')])
  console.log(table(['#', 'id', 'type', 'ticker', 'name'], rows))
}

async function cmd_txns(rest: string[]) {
  const { uid } = await require_session()
  const { values } = parseArgs({ args: rest, options: { limit: { type: 'string', short: 'n' } }, allowPositionals: false })
  const take = Math.max(1, Number(values.limit ?? 20) || 20)
  const txns = await prisma.transaction.findMany({
    where: { user_id: uid },
    orderBy: { datetime: 'desc' },
    take,
    include: { _count: { select: { line_items: true } } },
  })
  const rows = txns.map(t => [t.id, fmt_date(t.datetime), String(t._count.line_items), t.description ?? ''])
  console.log(table(['id', 'date', 'lines', 'description'], rows))
}

async function cmd_txn(rest: string[]) {
  const { uid } = await require_session()
  const id = rest[0]
  if (!id) throw new Error('Usage: txn <id>')
  const raw = await prisma.transaction.findFirst({
    where: { id, user_id: uid },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
  if (!raw) throw new Error('Transaction not found')
  const t = normalize_txn(raw)
  console.log(`Transaction ${t.id}`)
  console.log(`  Date:        ${fmt_date(t.datetime)}`)
  console.log(`  Description: ${t.description ?? '—'}`)
  const rows = t.line_items.map(li => [
    li.accounting_head.type,
    li.accounting_head.name,
    li.asset.name,
    li.quantity.toString(),
    money(li.txn_value.toNumber()),
    li.description ?? '',
  ])
  console.log(table(['type', 'head', 'asset', 'qty', 'value', 'note'], rows))
}

async function cmd_balances() {
  const { uid } = await require_session()
  const [{ accountsToAssets }, heads, assets] = await Promise.all([compute_balances_core(uid), load_heads(uid), load_assets()])
  const headById = new Map(heads.map(h => [h.id, h]))
  const assetById = new Map(assets.map(a => [a.id, a]))
  const rows: string[][] = []
  for (const [headId, assetMap] of accountsToAssets) {
    const head = headById.get(headId)
    if (!head || head.type !== 'account') continue
    for (const [assetId, bal] of assetMap) {
      if (Math.abs(bal.qty) < 1e-9 && Math.abs(bal.txn_value) < 1e-9) continue
      rows.push([head.name, assetById.get(assetId)?.name ?? assetId, String(bal.qty), money(bal.txn_value)])
    }
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  if (rows.length === 0) console.log('No account balances.')
  else console.log(table(['account', 'asset', 'qty', 'value'], rows))
}

/** Interactively build a list of line items, listing heads/assets for reference. */
async function build_line_items(uid: string): Promise<CreateLineItemInput[]> {
  const heads = await load_heads(uid)
  const assets = await load_assets()
  console.log('\nHeads:')
  console.log(
    table(
      ['#', 'type', 'name'],
      heads.map((h, i) => [String(i + 1), h.type, h.name]),
    ),
  )
  console.log('\nAssets:')
  console.log(
    table(
      ['#', 'type', 'name'],
      assets.map((a, i) => [String(i + 1), a.type, a.name]),
    ),
  )
  console.log('')

  const items: CreateLineItemInput[] = []
  for (;;) {
    const headRef = (await ask(`Line ${items.length + 1} — head (#/name/id, blank to finish): `)).trim()
    if (!headRef) {
      if (items.length === 0) {
        console.log('At least one line item is required.')
        continue
      }
      break
    }
    let head, asset
    try {
      head = resolve_ref(headRef, heads, 'head')
      const assetRef = (await ask('         asset (#/name/id): ')).trim()
      asset = resolve_ref(assetRef, assets, 'asset')
    } catch (e) {
      console.log(`  ${(e as Error).message}`)
      continue
    }
    const qtyStr = (await ask('         quantity (blank = auto): ')).trim()
    const valStr = (await ask('         value ₹ (blank = auto): ')).trim()
    const note = (await ask('         note (optional): ')).trim()
    items.push({
      accounting_head_id: head.id,
      asset_id: asset.id,
      quantity: qtyStr === '' ? undefined : Number(qtyStr),
      txn_value: valStr === '' ? null : Number(valStr),
      description: note || null,
    })
  }
  return items
}

async function ask_datetime(label: string, fallback: Date): Promise<Date> {
  const s = (await ask(`${label} (dd-MM-yyyy, blank = ${fmt_date(fallback)}): `)).trim()
  return s ? get_date_obj_from_indian_date(s) : fallback
}

async function cmd_add(rest: string[]) {
  const { uid } = await require_session()
  const { values } = parseArgs({ args: rest, options: { json: { type: 'string' } }, allowPositionals: false })

  if (values.json !== undefined) {
    const payload = await read_json_payload(values.json)
    const line_items = await resolve_json_lines(uid, payload.line_items)
    const datetime = payload.datetime ? new Date(payload.datetime) : new Date()
    print_result(await create_transaction_core(uid, datetime, line_items, payload.description ?? null))
    return
  }

  const items = await build_line_items(uid)
  const description = (await ask('Transaction description (optional): ')).trim() || null
  const datetime = await ask_datetime('Date', new Date())
  if (!(await confirm(`Create transaction with ${items.length} line item(s)?`))) {
    console.log('Aborted.')
    return
  }
  print_result(await create_transaction_core(uid, datetime, items, description))
}

async function cmd_edit(rest: string[]) {
  const { uid } = await require_session()
  const id = rest[0]
  if (!id) throw new Error('Usage: edit <id>')
  const existing = await prisma.transaction.findFirst({
    where: { id, user_id: uid },
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
  if (!existing) throw new Error('Transaction not found')
  console.log('Current transaction:')
  await cmd_txn([id])
  console.log('\nRe-enter the line items for this transaction:')
  const items = await build_line_items(uid)
  const description = (await ask(`Description (blank = "${existing.description ?? ''}"): `)).trim()
  const datetime = await ask_datetime('Date', existing.datetime)
  if (!(await confirm('Save changes?'))) {
    console.log('Aborted.')
    return
  }
  print_result(await update_transaction_core(uid, id, items, datetime, description === '' ? (existing.description ?? null) : description))
}

async function cmd_delete(rest: string[]) {
  const { uid } = await require_session()
  const id = rest[0]
  if (!id) throw new Error('Usage: delete <id>')
  await cmd_txn([id])
  if (!(await confirm('Delete this transaction?'))) {
    console.log('Aborted.')
    return
  }
  print_result(await delete_transaction_core(uid, id))
}

// --- JSON payload helpers (non-interactive `add --json`) ---------------------

type JsonLine = {
  accounting_head_id?: string
  head?: string
  asset_id?: string
  asset?: string
  quantity?: number
  txn_value?: number | null
  description?: string | null
}
type JsonPayload = { datetime?: string; description?: string | null; line_items: JsonLine[] }

async function read_json_payload(src: string): Promise<JsonPayload> {
  let text: string
  if (src === '-' || src === '') {
    text = await new Promise<string>(resolve => {
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', d => (buf += d))
      stdin.on('end', () => resolve(buf))
    })
  } else {
    text = await (await import('node:fs/promises')).readFile(src, 'utf8')
  }
  const parsed = JSON.parse(text) as JsonPayload
  if (!Array.isArray(parsed.line_items) || parsed.line_items.length === 0) throw new Error('json payload needs a non-empty line_items array')
  return parsed
}

async function resolve_json_lines(uid: string, lines: JsonLine[]): Promise<CreateLineItemInput[]> {
  const heads = await load_heads(uid)
  const assets = await load_assets()
  return lines.map(l => {
    const headRef = l.accounting_head_id ?? l.head
    const assetRef = l.asset_id ?? l.asset
    if (!headRef) throw new Error('each line needs accounting_head_id or head')
    if (!assetRef) throw new Error('each line needs asset_id or asset')
    return {
      accounting_head_id: resolve_ref(headRef, heads, 'head').id,
      asset_id: resolve_ref(assetRef, assets, 'asset').id,
      quantity: l.quantity,
      txn_value: l.txn_value ?? null,
      description: l.description ?? null,
    }
  })
}

// --- dispatch ----------------------------------------------------------------

const HELP = `ledger — terminal client for your triple-entry ledger

Usage: pnpm cli <command> [options]

Auth
  login                 Log in (prompts for username + password)
  logout                Forget the stored session
  whoami                Show the current session

Read
  heads                 List your accounting heads (with ids)
  assets                List the asset catalog (with ids)
  balances              Show per-account asset balances
  txns [-n N]           List recent transactions (default 20)
  txn <id>              Show a transaction's line items

Write
  add [--json <file|->] Create a transaction (interactive, or from JSON)
  edit <id>             Replace a transaction's line items (interactive)
  delete <id>          Delete a transaction (with confirmation)

Reads/writes the database in DATABASE_URL (local by default).`

async function main() {
  const [, , command, ...rest] = process.argv
  switch (command) {
    case 'login':
      return cmd_login()
    case 'logout':
      return cmd_logout()
    case 'whoami':
      return cmd_whoami()
    case 'heads':
      return cmd_heads()
    case 'assets':
      return cmd_assets()
    case 'balances':
      return cmd_balances()
    case 'txns':
      return cmd_txns(rest)
    case 'txn':
      return cmd_txn(rest)
    case 'add':
      return cmd_add(rest)
    case 'edit':
      return cmd_edit(rest)
    case 'delete':
      return cmd_delete(rest)
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP)
      return
    default:
      console.error(`Unknown command: ${command}\n`)
      console.log(HELP)
      process.exitCode = 1
  }
}

main()
  .catch(err => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    rl?.close()
    await prisma.$disconnect()
    // Redis (ioredis) keeps the event loop alive; force-exit once work is done.
    process.exit(process.exitCode ?? 0)
  })
