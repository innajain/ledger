import { parseArgs } from 'node:util'
import { prisma } from '@/lib/prisma'
import { compute_balances_core } from '@/app/_core/balances_core'
import { normalize_txn } from '@/app/_utils/normalize_txn'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import { require_session } from '../auth_store'
import { table, money, fmt_date } from '../format'
import { load_heads, load_assets, resolve_ref } from '../shared'

export async function cmd_heads(rest: string[]) {
  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, allowPositionals: true })
  const { uid } = await require_session()
  const heads = await load_heads(uid)
  if (values.json) {
    console.log(JSON.stringify(heads, null, 2))
    return
  }
  const nameById = new Map(heads.map(h => [h.id, h.name]))
  const rows = heads.map((h, i) => [
    String(i + 1),
    h.id,
    h.type,
    h.parent_id ? (nameById.get(h.parent_id) ?? '') : '',
    h.name + (h.is_active ? '' : ' (inactive)') + (h.linked_user_id ? ' 🔗' : ''),
  ])
  console.log(table(['#', 'id', 'type', 'parent', 'name'], rows))
}

export async function cmd_assets(rest: string[]) {
  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, allowPositionals: true })
  await require_session()
  const assets = await load_assets()
  if (values.json) {
    console.log(JSON.stringify(assets, null, 2))
    return
  }
  const rows = assets.map((a, i) => [String(i + 1), a.id, a.type, a.ticker ?? '', a.name + (a.is_active ? '' : ' (inactive)')])
  console.log(table(['#', 'id', 'type', 'ticker', 'name'], rows))
}

export async function cmd_txns(rest: string[]) {
  const { uid } = await require_session()
  const { values } = parseArgs({
    args: rest,
    options: {
      limit: { type: 'string', short: 'n' },
      search: { type: 'string', short: 's' },
      from: { type: 'string' },
      to: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: false,
  })
  const take = Math.max(1, Number(values.limit ?? 20) || 20)

  const fromDate = values.from ? get_date_obj_from_indian_date(values.from) : undefined
  let toDate: Date | undefined
  if (values.to) {
    toDate = get_date_obj_from_indian_date(values.to)
    toDate.setDate(toDate.getDate() + 1)
  }

  const txns = await prisma.transaction.findMany({
    where: {
      user_id: uid,
      ...(values.search ? { description: { contains: values.search, mode: 'insensitive' } } : {}),
      ...(fromDate || toDate ? { datetime: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
    },
    orderBy: { datetime: 'desc' },
    take,
    include: {
      _count: { select: { line_items: true } },
      line_items: { select: { txn_value: true } },
    },
  })
  if (values.json) {
    console.log(JSON.stringify(txns, null, 2))
    return
  }
  const rows = txns.map(t => {
    const amount = t.line_items.reduce((s, li) => s + (li.txn_value && li.txn_value.toNumber() > 0 ? li.txn_value.toNumber() : 0), 0)
    return [t.id, fmt_date(t.datetime), String(t._count.line_items), amount > 0 ? money(amount) : '—', t.description ?? '']
  })
  console.log(table(['id', 'date', 'lines', 'amount', 'description'], rows))
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

  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, allowPositionals: true })
  if (values.json) {
    console.log(JSON.stringify(t, null, 2))
    return
  }

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
  const total = t.line_items.reduce((s, li) => s + (li.txn_value.toNumber() > 0 ? li.txn_value.toNumber() : 0), 0)
  if (total > 0) console.log(`\n  Total: ${money(total)}`)
}

export async function cmd_head_txns(rest: string[]) {
  const { uid } = await require_session()
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      limit: { type: 'string', short: 'n' },
      from: { type: 'string' },
      to: { type: 'string' },
      json: { type: 'boolean' },
    },
    allowPositionals: true,
  })

  const ref = positionals[0]
  if (!ref) throw new Error('Usage: head-txns <head-ref> [-n N] [--from dd-MM-yyyy] [--to dd-MM-yyyy]')

  const heads = await load_heads(uid)
  const head = resolve_ref(ref, heads, 'head')

  const take = Math.max(1, Number(values.limit ?? 200) || 200)

  const fromDate = values.from ? get_date_obj_from_indian_date(values.from) : undefined
  let toDate: Date | undefined
  if (values.to) {
    toDate = get_date_obj_from_indian_date(values.to)
    toDate.setDate(toDate.getDate() + 1)
  }

  const rawTxns = await prisma.transaction.findMany({
    where: {
      user_id: uid,
      line_items: { some: { accounting_head_id: head.id } },
      ...(fromDate || toDate ? { datetime: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lt: toDate } : {}) } } : {}),
    },
    orderBy: { datetime: 'desc' },
    take,
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })

  const txns = rawTxns.map(normalize_txn)

  const rows = txns.map(t => {
    const headLines = t.line_items.filter(li => li.accounting_head_id === head.id)
    const value = headLines.reduce((s, li) => s + li.txn_value.toNumber(), 0)
    return { id: t.id, date: fmt_date(t.datetime), value, description: t.description ?? '' }
  })

  if (values.json) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }

  console.log(`Head: ${head.name} (${head.type})\n`)
  const tableRows = rows.map(r => [r.id, r.date, money(r.value), r.description])
  console.log(table(['id', 'date', 'value', 'description'], tableRows))

  const total = rows.reduce((s, r) => s + r.value, 0)
  if (rows.length > 0) console.log(`\n  ${rows.length} transactions · Total: ${money(total)}`)
}

export async function cmd_balances(rest: string[]) {
  const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, allowPositionals: true })
  const { uid } = await require_session()
  const [{ accountsToAssets }, heads, assets] = await Promise.all([compute_balances_core(uid), load_heads(uid), load_assets()])
  const headById = new Map(heads.map(h => [h.id, h]))
  const assetById = new Map(assets.map(a => [a.id, a]))

  if (values.json) {
    const data = Array.from(accountsToAssets.entries()).map(([headId, assetMap]) => {
      const head = headById.get(headId)
      return {
        head_id: headId,
        head_name: head?.name,
        head_type: head?.type,
        assets: Array.from(assetMap.entries()).map(([assetId, bal]) => ({
          asset_id: assetId,
          asset_name: assetById.get(assetId)?.name,
          qty: bal.qty,
          txn_value: bal.txn_value,
        })),
      }
    })
    console.log(JSON.stringify(data, null, 2))
    return
  }

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
