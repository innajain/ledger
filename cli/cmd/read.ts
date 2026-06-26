import { parseArgs } from 'node:util'
import { prisma } from '@/lib/prisma'
import { compute_balances_core } from '@/app/_core/balances_core'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { require_session } from '../auth_store'
import { table, money, fmt_date } from '../format'
import { load_heads, load_assets } from '../shared'

export async function cmd_heads() {
  const { uid } = await require_session()
  const heads = await load_heads(uid)
  const rows = heads.map((h, i) => [String(i + 1), h.id, h.type, h.name + (h.is_active ? '' : ' (inactive)') + (h.linked_user_id ? ' 🔗' : '')])
  console.log(table(['#', 'id', 'type', 'name'], rows))
}

export async function cmd_assets() {
  await require_session()
  const assets = await load_assets()
  const rows = assets.map((a, i) => [String(i + 1), a.id, a.type, a.ticker ?? '', a.name + (a.is_active ? '' : ' (inactive)')])
  console.log(table(['#', 'id', 'type', 'ticker', 'name'], rows))
}

export async function cmd_txns(rest: string[]) {
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

export async function cmd_txn(rest: string[]) {
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

export async function cmd_balances() {
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
