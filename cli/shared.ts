import { prisma } from '@/lib/prisma'
import { get_date_obj_from_indian_date } from '@/app/_utils/date'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'
import type { ActionResult } from '@/app/_actions/_result'
import { get_line_item_defaults_core } from '@/app/_core/preferences_core'
import { ask } from './prompt'
import { table, fmt_date } from './format'

export const load_heads = (uid: string) =>
  prisma.accounting_head.findMany({
    where: { user_id: uid },
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, is_active: true, linked_user_id: true, parent_id: true },
  })

export const load_assets = () =>
  prisma.asset.findMany({
    orderBy: [{ type: 'asc' }, { order_index: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    select: { id: true, name: true, type: true, ticker: true, is_active: true },
  })

export function resolve_ref<T extends { id: string; name: string }>(ref: string, list: T[], kind: string): T {
  const r = ref.trim()
  const asIndex = Number(r)
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= list.length) return list[asIndex - 1]
  const byId = list.find(x => x.id === r)
  if (byId) return byId
  const byName = list.find(x => x.name.toLowerCase() === r.toLowerCase())
  if (byName) return byName
  throw new Error(`No ${kind} matching "${ref}"`)
}

export function print_result(res: ActionResult<unknown>): void {
  if (res.success) console.log(`✓ ${res.message ?? 'Done'}`)
  else {
    console.error(`✗ [${res.code}] ${res.message}`)
    process.exitCode = 1
  }
}

export async function ask_datetime(label: string, fallback: Date): Promise<Date> {
  const s = (await ask(`${label} (dd-MM-yyyy, blank = ${fmt_date(fallback)}): `)).trim()
  return s ? get_date_obj_from_indian_date(s) : fallback
}

export async function build_line_items(uid: string): Promise<CreateLineItemInput[]> {
  const [heads, assets, defaults] = await Promise.all([load_heads(uid), load_assets(), get_line_item_defaults_core(uid)])

  const defaultHeadIds = new Set([defaults.default_account_id, defaults.default_allocation_id, defaults.default_income_expense_id].filter(Boolean))
  const defaultAsset = assets.find(a => a.id === defaults.default_asset_id)

  console.log('\nHeads:')
  console.log(
    table(
      ['#', 'type', 'name'],
      heads.map((h, i) => [String(i + 1), h.type, h.name + (defaultHeadIds.has(h.id) ? ' *' : '')]),
    ),
  )
  console.log('\nAssets:')
  console.log(
    table(
      ['#', 'type', 'ticker', 'name'],
      assets.map((a, i) => [String(i + 1), a.type, a.ticker ?? '', a.name + (a.id === defaults.default_asset_id ? ' *' : '')]),
    ),
  )
  if (defaultHeadIds.size > 0 || defaultAsset) console.log('  (* = your default)')
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
      const assetHint = defaultAsset ? `, blank = ${defaultAsset.name}` : ''
      const assetRef = (await ask(`         asset (#/name/id${assetHint}): `)).trim()
      if (!assetRef && defaultAsset) {
        asset = defaultAsset
      } else {
        asset = resolve_ref(assetRef, assets, 'asset')
      }
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
