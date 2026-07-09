import { parseArgs } from 'node:util'
import { sign_token, sign_up_core, change_password_core, change_username_core } from '@/app/_core/auth_core'
import { create_upi_payment_core } from '@/app/_core/transactions_core'
import {
  get_user_preferences_core,
  update_user_preferences_core,
  get_line_item_defaults_core,
  update_line_item_defaults_core,
  update_own_upi_core,
  type LineItemDefaults,
} from '@/app/_core/preferences_core'
import { prisma } from '@/lib/prisma'
import { require_session, save_token } from '../auth_store'
import { ask, ask_hidden } from '../prompt'
import { print_result, load_heads, load_assets, resolve_ref } from '../shared'
import { table } from '../format'

const parse_bool = (v: string | undefined) => (v === undefined ? undefined : v === 'true' || v === 'yes' || v === '1')

export async function cmd_prefs() {
  const { uid } = await require_session()
  const [prefs, defaults, user] = await Promise.all([
    get_user_preferences_core(uid),
    get_line_item_defaults_core(uid),
    prisma.user.findUnique({ where: { id: uid }, select: { upi_id: true, is_admin: true } }),
  ])
  const heads = await load_heads(uid)
  const assets = await load_assets()
  const nameOf = (id: string | null, list: { id: string; name: string }[]) => (id ? (list.find(x => x.id === id)?.name ?? id) : '—')
  console.log(
    table(
      ['setting', 'value'],
      [
        ['theme', prefs.theme],
        ['masking_enabled', String(prefs.masking_enabled)],
        ['mask_threshold', String(prefs.mask_threshold)],
        ['graphs_visible', String(prefs.graphs_visible)],
        ['upi_id', user?.upi_id ?? '—'],
        ['admin', String(!!user?.is_admin)],
        ['default account', nameOf(defaults.default_account_id, heads)],
        ['default allocation', nameOf(defaults.default_allocation_id, heads)],
        ['default income/expense', nameOf(defaults.default_income_expense_id, heads)],
        ['default asset', nameOf(defaults.default_asset_id, assets)],
      ],
    ),
  )
}

export async function cmd_prefs_set(rest: string[]) {
  const { uid } = await require_session()
  const { values } = parseArgs({
    args: rest,
    options: { theme: { type: 'string' }, masking: { type: 'string' }, threshold: { type: 'string' }, graphs: { type: 'string' } },
    allowPositionals: false,
  })
  const patch: Record<string, unknown> = {}
  if (values.theme !== undefined) patch.theme = values.theme
  if (values.masking !== undefined) patch.masking_enabled = parse_bool(values.masking)
  if (values.threshold !== undefined) patch.mask_threshold = Number(values.threshold)
  if (values.graphs !== undefined) patch.graphs_visible = parse_bool(values.graphs)
  if (Object.keys(patch).length === 0) throw new Error('Nothing to set. Use --theme / --masking / --threshold / --graphs')
  print_result(await update_user_preferences_core(uid, patch))
}

export async function cmd_defaults_set(rest: string[]) {
  const { uid } = await require_session()
  const { values } = parseArgs({
    args: rest,
    options: { account: { type: 'string' }, allocation: { type: 'string' }, 'income-expense': { type: 'string' }, asset: { type: 'string' } },
    allowPositionals: false,
  })
  const heads = await load_heads(uid)
  const assets = await load_assets()
  const ref = (v: string | undefined, list: { id: string; name: string }[], kind: string, current: string | null) =>
    v === undefined ? current : v === 'none' || v === '' ? null : resolve_ref(v, list, kind).id

  const current = await get_line_item_defaults_core(uid)
  const next: LineItemDefaults = {
    default_account_id: ref(
      values.account,
      heads.filter(h => h.type === 'account'),
      'account',
      current.default_account_id,
    ),
    default_allocation_id: ref(
      values.allocation,
      heads.filter(h => h.type === 'allocation'),
      'allocation',
      current.default_allocation_id,
    ),
    default_income_expense_id: ref(
      values['income-expense'],
      heads.filter(h => h.type === 'income_expense'),
      'income/expense',
      current.default_income_expense_id,
    ),
    default_asset_id: ref(values.asset, assets, 'asset', current.default_asset_id),
  }
  print_result(await update_line_item_defaults_core(uid, next))
}

export async function cmd_upi_set(rest: string[]) {
  const { uid } = await require_session()
  const value = rest[0]
  if (value === undefined) throw new Error('Usage: upi-set <upi_id|none>')
  print_result(await update_own_upi_core(uid, value === 'none' ? null : value))
}

export async function cmd_pay(rest: string[]) {
  const { uid } = await require_session()
  const { values } = parseArgs({
    args: rest,
    options: { to: { type: 'string' }, amount: { type: 'string', short: 'a' }, note: { type: 'string' } },
    allowPositionals: false,
  })
  if (!values.to) throw new Error('Usage: pay --to <account ref> --amount <N> [--note ...]')
  const amount = Number(values.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('--amount must be a positive number')
  const accounts = (await load_heads(uid)).filter(h => h.type === 'account')
  const payee = resolve_ref(values.to, accounts, 'account')
  print_result(await create_upi_payment_core(uid, { payee_account_id: payee.id, amount, description: values.note ?? null }))
}

export async function cmd_signup() {
  const username = (await ask('New username: ')).trim()
  const password = await ask_hidden('New password: ')
  const confirm = await ask_hidden('Confirm password: ')
  if (password !== confirm) {
    console.error('✗ passwords do not match')
    process.exitCode = 1
    return
  }
  const res = await sign_up_core({ username, password })
  if (!res.success) {
    print_result(res)
    return
  }
  const token = await sign_token({ uid: res.data!.id, username: res.data!.username })
  await save_token(token)
  console.log(`✓ Account created — logged in as ${res.data!.username}`)
}

export async function cmd_passwd() {
  const { uid, username } = await require_session()
  const current_password = await ask_hidden('Current password: ')
  const new_password = await ask_hidden('New password: ')
  const res = await change_password_core(uid, { current_password, new_password })
  if (!res.success) {
    print_result(res)
    return
  }

  await save_token(await sign_token({ uid, username }))
  console.log('✓ Password changed')
}

export async function cmd_rename() {
  const { uid } = await require_session()
  const new_username = (await ask('New username: ')).trim()
  const password = await ask_hidden('Password: ')
  const res = await change_username_core(uid, { new_username, password })
  if (!res.success) {
    print_result(res)
    return
  }
  await save_token(await sign_token({ uid, username: res.data!.username }))
  console.log(`✓ Username changed to ${res.data!.username}`)
}
