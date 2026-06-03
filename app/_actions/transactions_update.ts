'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { CreateLineItemInput } from './transactions'
import { validate_line_items } from '../_utils/validate_line_items'
import { toDecimal } from '../_utils/decimal'
import { invalidate_balances } from './compute_balances'
import { sync_links_after_update } from '../_utils/links'
import { notify_request_pending } from '../_utils/notify_events'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { ActionResult, ok, err, fromError, ActionError } from './_result'

const updateTransactionSchema = z.object({
  id: z.string().min(1, 'Transaction ID is required'),
  line_items: z
    .array(
      z.object({
        accounting_head_id: z.string(),
        asset_id: z.string(),
        quantity: z.number().optional(),
        txn_value: z.number().nullish(),
        description: z
          .string()
          .trim()
          .transform(val => (val === '' ? null : val))
          .nullish(),
        datetime: z.date().nullish(),
      }),
    )
    .min(1, 'At least one line item is required'),
  description: z
    .string()
    .trim()
    .transform(val => (val === '' ? null : val))
    .nullish(),
})

export async function update_transaction(
  id: string,
  line_items: CreateLineItemInput[],
  datetime?: Date | undefined,
  description?: string | null | undefined,
): Promise<ActionResult> {
  try {
    const parsed = updateTransactionSchema.safeParse({ id, line_items, description })
    if (!parsed.success) return err('VALIDATION', parsed.error.issues[0].message)
    id = parsed.data.id
    line_items = parsed.data.line_items
    description = parsed.data.description

    const user_id = await get_current_user_id()
    if (!user_id) return err('UNAUTHORIZED', 'You must be logged in to update transactions')

    await prisma.$transaction(async prisma => {
      // ensure transaction exists and belongs to user
      const existing = await prisma.transaction.findUnique({
        where: { id, user_id },
      })
      if (!existing) throw new ActionError('NOT_FOUND', 'Transaction not found or does not belong to your user')

      const accounting_head_ids = Array.from(new Set(line_items.map(li => li.accounting_head_id)))
      const asset_ids = Array.from(new Set(line_items.map(li => li.asset_id)))

      const accounts = await prisma.accounting_head.findMany({
        where: { id: { in: accounting_head_ids }, user_id },
      })
      if (accounts.length !== accounting_head_ids.length)
        throw new ActionError('VALIDATION', 'One or more accounts not found or do not belong to your user')

      const assets = await prisma.asset.findMany({
        where: { id: { in: asset_ids } },
      })
      if (assets.length !== asset_ids.length) throw new ActionError('VALIDATION', 'One or more assets not found')

      const { is_valid, message } = validate_line_items(
        line_items.map(li => ({
          quantity: toDecimal(li.quantity),
          txn_value: toDecimal(li.txn_value),
          asset: assets.find(a => a.id === li.asset_id)!,
          accounting_head: accounts.find(a => a.id === li.accounting_head_id)!,
        })),
      )

      if (!is_valid) throw new ActionError('VALIDATION', message)
      // Replace line items: delete existing then add new ones, and update transaction
      await prisma.line_item.deleteMany({ where: { transaction_id: id } })

      await prisma.transaction.update({
        where: { id, user_id },
        data: {
          datetime,
          description,
          line_items: {
            create: line_items.map(li => ({
              quantity: toDecimal(li.quantity),
              txn_value: toDecimal(li.txn_value),
              accounting_head_id: li.accounting_head_id,
              asset_id: li.asset_id,
              description: li.description,
              datetime: li.datetime,
            })),
          },
        },
      })

      // Reconcile cross-user approval links: re-open requests for counterparties
      // whose linked lines changed, add links for new ones (throws on the anchor
      // hard-block or on removing a shared portion).
      await sync_links_after_update(prisma, user_id, id)
    })

    await invalidate_balances(user_id)

    // Notify counterparties whose approval this edit now awaits (re-opened links).
    const pending_links = await prisma.transaction_link.findMany({
      where: {
        pending_status: 'pending',
        pending_by: { not: user_id },
        OR: [
          { user_a_id: user_id, txn_a_id: id },
          { user_b_id: user_id, txn_b_id: id },
        ],
      },
    })
    if (pending_links.length > 0) {
      const txn = await prisma.transaction.findUnique({ where: { id }, select: { description: true } })
      for (const link of pending_links) {
        const cp = link.user_a_id === user_id ? link.user_b_id : link.user_a_id
        void notify_request_pending(cp, user_id, { changed: true, description: txn?.description ?? null })
      }
    }
    return ok(undefined, 'Transaction updated successfully')
  } catch (error) {
    logger.error({ err: error, action: 'update_transaction' }, 'Error updating transaction')
    return fromError(error)
  }
}
