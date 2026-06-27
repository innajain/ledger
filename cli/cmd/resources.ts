import { parseArgs } from 'node:util'
import { prisma } from '@/lib/prisma'
import type { accounting_head_type, asset_type } from '@/generated/prisma/client'
import {
  find_user_by_username_core,
  create_account_core,
  update_account_core,
  delete_account_core,
  create_asset_core,
  update_asset_core,
  delete_asset_core,
} from '@/app/_core/resources_core'
import { require_session } from '../auth_store'
import { print_result, load_heads, resolve_ref } from '../shared'

const HEAD_TYPES = ['account', 'income_expense', 'allocation']
const ASSET_TYPES = ['rupees', 'mf', 'etf', 'shares', 'other']
const parse_bool = (v: string | undefined) => (v === undefined ? undefined : v === 'true' || v === 'yes' || v === '1')

async function require_admin_cli(uid: string) {
  const rec = await prisma.user.findUnique({ where: { id: uid }, select: { is_admin: true } })
  if (!rec?.is_admin) throw new Error('admin only — your user is not an admin')
}

/** Resolve --parent (a head #/name/id) to an id, or undefined. */
async function resolve_parent(uid: string, ref: string | undefined): Promise<string | null | undefined> {
  if (ref === undefined) return undefined
  if (ref === 'none' || ref === '') return null
  const heads = await load_heads(uid)
  return resolve_ref(ref, heads, 'parent head').id
}

/** Resolve --link (a username, or "none") to a linked user id / null / undefined. */
async function resolve_link(uid: string, ref: string | undefined): Promise<string | null | undefined> {
  if (ref === undefined) return undefined
  if (ref === 'none' || ref === '') return null
  const res = await find_user_by_username_core(uid, ref)
  if (!res.success) throw new Error(res.message)
  return res.data!.id
}

export async function cmd_head_add(rest: string[]) {
  const { uid } = await require_session()
  const { values, positionals } = parseArgs({
    args: rest,
    options: { type: { type: 'string', short: 't' }, parent: { type: 'string' }, link: { type: 'string' } },
    allowPositionals: true,
  })
  const name = positionals[0]
  if (!name) throw new Error('Usage: head-add <name> --type <account|income_expense|allocation> [--parent <ref>] [--link <username>]')
  if (!values.type || !HEAD_TYPES.includes(values.type)) throw new Error(`--type must be one of: ${HEAD_TYPES.join(', ')}`)
  const parent_id = await resolve_parent(uid, values.parent)
  const linked = await resolve_link(uid, values.link)
  print_result(await create_account_core(uid, name, values.type as accounting_head_type, parent_id ?? null, linked ?? null))
}

export async function cmd_head_edit(rest: string[]) {
  const { uid } = await require_session()
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      type: { type: 'string', short: 't' },
      parent: { type: 'string' },
      active: { type: 'string' },
      link: { type: 'string' },
    },
    allowPositionals: true,
  })
  const id = positionals[0]
  if (!id) throw new Error('Usage: head-edit <id> [--name X] [--type T] [--parent <ref>|none] [--active true|false] [--link <username>|none]')
  const parent_id = await resolve_parent(uid, values.parent)
  const linked = await resolve_link(uid, values.link)
  print_result(
    await update_account_core(
      uid,
      id,
      values.name,
      values.type as accounting_head_type | undefined,
      parent_id,
      parse_bool(values.active),
      undefined,
      linked,
    ),
  )
}

export async function cmd_head_rm(rest: string[]) {
  const { uid } = await require_session()
  const id = rest[0]
  if (!id) throw new Error('Usage: head-rm <id>')
  print_result(await delete_account_core(uid, id))
}

export async function cmd_asset_add(rest: string[]) {
  const { uid } = await require_session()
  await require_admin_cli(uid)
  const { values, positionals } = parseArgs({
    args: rest,
    options: { type: { type: 'string', short: 't' }, ticker: { type: 'string' } },
    allowPositionals: true,
  })
  const name = positionals[0]
  if (!name) throw new Error('Usage: asset-add <name> --type <rupees|mf|etf|shares|other> [--ticker T]')
  if (!values.type || !ASSET_TYPES.includes(values.type)) throw new Error(`--type must be one of: ${ASSET_TYPES.join(', ')}`)
  print_result(await create_asset_core(name, values.type as asset_type, values.ticker ?? null))
}

export async function cmd_asset_edit(rest: string[]) {
  const { uid } = await require_session()
  await require_admin_cli(uid)
  const { values, positionals } = parseArgs({
    args: rest,
    options: { name: { type: 'string' }, type: { type: 'string', short: 't' }, ticker: { type: 'string' }, active: { type: 'string' } },
    allowPositionals: true,
  })
  const id = positionals[0]
  if (!id) throw new Error('Usage: asset-edit <id> [--name X] [--type T] [--ticker T] [--active true|false]')
  print_result(await update_asset_core(id, values.name, values.type as asset_type | undefined, values.ticker, undefined, parse_bool(values.active)))
}

export async function cmd_asset_rm(rest: string[]) {
  const { uid } = await require_session()
  await require_admin_cli(uid)
  const id = rest[0]
  if (!id) throw new Error('Usage: asset-rm <id>')
  print_result(await delete_asset_core(id))
}
