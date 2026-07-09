import { parseArgs } from 'node:util'
import { stdin } from 'node:process'
import { prisma } from '@/lib/prisma'
import { create_transaction_core, update_transaction_core, delete_transaction_core, type CreateLineItemInput } from '@/app/_core/transactions_core'
import { require_session } from '../auth_store'
import { ask, confirm } from '../prompt'
import { print_result, build_line_items, ask_datetime, load_heads, load_assets, resolve_ref } from '../shared'
import { cmd_txn } from './read'

export async function cmd_add(rest: string[]) {
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

export async function cmd_edit(rest: string[]) {
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

export async function cmd_delete(rest: string[]) {
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
