/**
 * Framework-agnostic transaction-template CRUD, shared by the web actions
 * (`app/_actions/templates.ts`, which add `revalidatePath`) and the CLI.
 * Takes an explicit `user_id`; no `next/cache`.
 */
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { toDecimal } from '@/app/_utils/decimal'
import { ActionResult, ok, err, fromError } from '@/app/_actions/_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

type TemplatePayload = Awaited<ReturnType<typeof prisma.transaction_template.create>>
export type TemplateWithLineItems = TemplatePayload & { line_items: unknown[] }

const templateSchema = z.object({
  description: z
    .string()
    .trim()
    .max(2000, 'Description is too long')
    .transform(val => (val === '' ? null : val))
    .nullish(),
})

export async function create_transaction_template_core(
  user_id: string,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<ActionResult<TemplateWithLineItems>> {
  try {
    if (line_items.length === 0) return err('VALIDATION', 'At least one line item is required')
    description = templateSchema.parse({ description }).description

    const template = await prisma.transaction_template.create({
      data: {
        user_id,
        description,
        line_items: {
          create: line_items.map(li => ({
            accounting_head_id: li.accounting_head_id,
            asset_id: li.asset_id,
            quantity: toDecimal(li.quantity),
            txn_value: toDecimal(li.txn_value),
            description: li.description || null,
          })),
        },
      },
      include: { line_items: true },
    })
    return ok(template as TemplateWithLineItems, 'Template created')
  } catch (error) {
    return fromError(error)
  }
}

export async function get_transaction_templates_core(user_id: string) {
  return prisma.transaction_template.findMany({
    where: { user_id },
    include: {
      line_items: {
        include: {
          accounting_head: { select: { name: true, type: true } },
          asset: { select: { name: true, type: true } },
        },
      },
    },
    orderBy: { description: 'asc' },
  })
}

export async function update_transaction_template_core(
  user_id: string,
  id: string,
  line_items: CreateLineItemInput[],
  description?: string | null | undefined,
): Promise<ActionResult<TemplateWithLineItems>> {
  try {
    if (line_items.length === 0) return err('VALIDATION', 'At least one line item is required')
    description = templateSchema.parse({ description }).description

    const existing = await prisma.transaction_template.findUnique({ where: { id, user_id } })
    if (!existing) return err('NOT_FOUND', 'Template not found or unauthorized')

    const template = await prisma.transaction_template.update({
      where: { id },
      data: {
        description,
        line_items: {
          deleteMany: {},
          create: line_items.map(li => ({
            accounting_head_id: li.accounting_head_id,
            asset_id: li.asset_id,
            quantity: toDecimal(li.quantity),
            txn_value: toDecimal(li.txn_value),
            description: li.description || null,
          })),
        },
      },
      include: { line_items: true },
    })
    return ok(template as TemplateWithLineItems, 'Template updated')
  } catch (error) {
    return fromError(error)
  }
}

export async function delete_transaction_template_core(user_id: string, id: string): Promise<ActionResult> {
  try {
    await prisma.transaction_template.delete({ where: { id, user_id } })
    return ok()
  } catch (error) {
    return fromError(error)
  }
}
