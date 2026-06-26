import { prisma } from '@/lib/prisma'
import { get_transaction_templates_core, create_transaction_template_core, delete_transaction_template_core } from '@/app/_core/templates_core'
import { create_transaction_core, type CreateLineItemInput } from '@/app/_core/transactions_core'
import { require_session } from '../auth_store'
import { ask, confirm } from '../prompt'
import { table, money } from '../format'
import { print_result, build_line_items } from '../shared'

export async function cmd_templates() {
  const { uid } = await require_session()
  const templates = await get_transaction_templates_core(uid)
  if (templates.length === 0) {
    console.log('No templates.')
    return
  }
  for (const t of templates) {
    console.log(`\n${t.id}  —  ${t.description ?? '(no description)'}`)
    console.log(
      table(
        ['head', 'asset', 'qty', 'value'],
        t.line_items.map(li => [
          li.accounting_head.name,
          li.asset.name,
          li.quantity === null ? '·' : li.quantity.toString(),
          li.txn_value === null ? '·' : money(li.txn_value.toNumber()),
        ]),
      ),
    )
  }
}

export async function cmd_template_add() {
  const { uid } = await require_session()
  const items = await build_line_items(uid)
  const description = (await ask('Template description (optional): ')).trim() || null
  print_result(await create_transaction_template_core(uid, items, description))
}

export async function cmd_template_rm(rest: string[]) {
  const { uid } = await require_session()
  const id = rest[0]
  if (!id) throw new Error('Usage: template-rm <id>')
  print_result(await delete_transaction_template_core(uid, id))
}

export async function cmd_template_apply(rest: string[]) {
  const { uid } = await require_session()
  const id = rest[0]
  if (!id) throw new Error('Usage: template-apply <id>')
  const tmpl = await prisma.transaction_template.findFirst({
    where: { id, user_id: uid },
    include: { line_items: true },
  })
  if (!tmpl) throw new Error('Template not found')

  const items: CreateLineItemInput[] = tmpl.line_items.map(li => ({
    accounting_head_id: li.accounting_head_id,
    asset_id: li.asset_id,
    quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
    txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
    description: li.description ?? null,
  }))
  console.log(`Applying template "${tmpl.description ?? id}" — ${items.length} line item(s), dated today.`)
  if (!(await confirm('Create this transaction?'))) {
    console.log('Aborted.')
    return
  }
  print_result(await create_transaction_core(uid, new Date(), items, tmpl.description ?? null))
}
