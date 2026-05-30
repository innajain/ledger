'use server'

import { prisma } from '@/lib/prisma'
import { get_current_user_id } from '@/app/_actions/auth'
import { build_actor_copy, other_user, my_txn_id } from '@/app/_utils/links'
import { invalidate_balances } from './compute_balances'
import { logger } from '@/lib/logger'
import { ActionResult, ok, err, fromError } from './_result'
import type { CreateLineItemInput } from './transactions'

// Approve the request currently awaiting me. For a `change` request I author my
// balanced copy (the locked mirrored lines are added server-side); for a
// `deletion` request I remove my copy and the link closes.
export async function approve_request(link_id: string, balancing_lines: CreateLineItemInput[] = []): Promise<ActionResult> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')

    const { other_id } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new Error('Request not found')
      if (link.pending_status !== 'pending' || link.pending_by !== me) throw new Error('This request is not awaiting your approval')

      const other_id = other_user(link, me)
      if (link.pending_kind === 'deletion') {
        const mine = my_txn_id(link, me)
        if (mine) await tx.transaction.delete({ where: { id: mine } })
        await tx.transaction_link.delete({ where: { id: link.id } })
      } else {
        await build_actor_copy(tx, link, me, balancing_lines)
      }
      return { other_id }
    })

    await Promise.all([invalidate_balances(me), invalidate_balances(other_id)])
    return ok(undefined, 'Request approved')
  } catch (error) {
    logger.error({ err: error, action: 'approve_request' }, 'approve_request failed')
    return fromError(error)
  }
}

// Reject the request awaiting me. The ball passes back to the proposer, whose
// copy is now poisoned/absent; they resolve it (resubmit, revert, or delete).
export async function reject_request(link_id: string): Promise<ActionResult> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')

    await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new Error('Request not found')
      if (link.pending_status !== 'pending' || link.pending_by !== me) throw new Error('This request is not awaiting your action')

      await tx.transaction_link.update({
        where: { id: link.id },
        data: { pending_status: 'rejected', pending_by: other_user(link, me) },
      })
    })
    return ok(undefined, 'Request rejected')
  } catch (error) {
    return fromError(error)
  }
}

// Discard my rejected change and rebuild my copy from the counterpart's
// still-approved anchor. I supply fresh balancing lines; the mirrored lines come
// from the anchor.
export async function revert_request(link_id: string, balancing_lines: CreateLineItemInput[] = []): Promise<ActionResult> {
  try {
    const me = await get_current_user_id()
    if (!me) return err('UNAUTHORIZED', 'unauthorized')

    const { other_id } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new Error('Request not found')
      if (link.pending_status !== 'rejected' || link.pending_by !== me) throw new Error('There is no rejected request for you to revert')

      await build_actor_copy(tx, link, me, balancing_lines)
      return { other_id: other_user(link, me) }
    })

    await Promise.all([invalidate_balances(me), invalidate_balances(other_id)])
    return ok(undefined, 'Reverted to the approved version')
  } catch (error) {
    logger.error({ err: error, action: 'revert_request' }, 'revert_request failed')
    return fromError(error)
  }
}
