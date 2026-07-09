import { parseArgs } from 'node:util'
import { get_inbox, get_outbox } from '@/app/_utils/links'
import { approve_request_core, reject_request_core, cancel_request_core, revert_request_core, accept_all_from_core } from '@/app/_core/approvals_core'
import { require_session } from '../auth_store'
import { table, money } from '../format'
import { print_result, load_heads, resolve_ref, build_line_items } from '../shared'

const preview_str = (p: { asset_name: string; quantity: number | null; txn_value: number | null }[]) =>
  p.map(l => `${l.quantity ?? '·'} ${l.asset_name}${l.txn_value != null ? ` (${money(l.txn_value)})` : ''}`).join(', ') || '—'

export async function cmd_requests() {
  const { uid } = await require_session()
  const [inbox, outbox] = await Promise.all([get_inbox(uid), get_outbox(uid)])

  console.log(`Inbox — awaiting you (${inbox.length})`)
  if (inbox.length === 0) console.log('  (nothing)')
  else
    console.log(
      table(
        ['link_id', 'status', 'kind', 'from', 'preview', 'description'],
        inbox.map(i => [i.link_id, i.status + (i.can_revert ? '↩' : ''), i.kind, i.other_username, preview_str(i.preview), i.description ?? '']),
      ),
    )

  console.log(`\nOutbox — awaiting them (${outbox.length})`)
  if (outbox.length === 0) console.log('  (nothing)')
  else
    console.log(
      table(
        ['link_id', 'kind', 'to', 'preview', 'description'],
        outbox.map(o => [o.link_id, o.kind, o.other_username, preview_str(o.preview), o.description ?? '']),
      ),
    )
}

async function resolve_balancing_account(uid: string, accountRef: string | undefined): Promise<string | undefined> {
  if (!accountRef) return undefined
  const accounts = (await load_heads(uid)).filter(h => h.type === 'account' && !h.linked_user_id)
  return resolve_ref(accountRef, accounts, 'account').id
}

export async function cmd_approve(rest: string[]) {
  const { uid } = await require_session()
  const { values, positionals } = parseArgs({
    args: rest,
    options: { account: { type: 'string', short: 'a' }, lines: { type: 'boolean' } },
    allowPositionals: true,
  })
  const link_id = positionals[0]
  if (!link_id) throw new Error('Usage: approve <link_id> [--account <ref> | --lines]')

  const auto = await resolve_balancing_account(uid, values.account)
  const balancing = values.lines ? await build_line_items(uid) : []
  print_result(await approve_request_core(uid, link_id, balancing, auto))
}

export async function cmd_reject(rest: string[]) {
  const { uid } = await require_session()
  const link_id = rest[0]
  if (!link_id) throw new Error('Usage: reject <link_id>')
  print_result(await reject_request_core(uid, link_id))
}

export async function cmd_cancel(rest: string[]) {
  const { uid } = await require_session()
  const link_id = rest[0]
  if (!link_id) throw new Error('Usage: cancel <link_id>')
  print_result(await cancel_request_core(uid, link_id))
}

export async function cmd_revert(rest: string[]) {
  const { uid } = await require_session()
  const { values, positionals } = parseArgs({
    args: rest,
    options: { account: { type: 'string', short: 'a' }, lines: { type: 'boolean' } },
    allowPositionals: true,
  })
  const link_id = positionals[0]
  if (!link_id) throw new Error('Usage: revert <link_id> [--account <ref> | --lines]')
  const auto = await resolve_balancing_account(uid, values.account)
  const balancing = values.lines ? await build_line_items(uid) : []
  print_result(await revert_request_core(uid, link_id, balancing, auto))
}

export async function cmd_accept_all(rest: string[]) {
  const { uid } = await require_session()
  const { values, positionals } = parseArgs({ args: rest, options: { account: { type: 'string', short: 'a' } }, allowPositionals: true })
  const counterparty_id = positionals[0]
  if (!counterparty_id) throw new Error('Usage: accept-all <counterparty_user_id> --account <ref>')
  const account_id = await resolve_balancing_account(uid, values.account)
  if (!account_id) throw new Error('accept-all requires --account <ref> (one of your own accounts to balance onto)')
  print_result(await accept_all_from_core(uid, counterparty_id, account_id))
}
