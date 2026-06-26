/**
 * Framework-agnostic cross-user approval logic, shared by the web actions
 * (`app/_actions/approvals.ts`) and the CLI. Each function takes the acting
 * user id (`me`) explicitly. The inbox/outbox readers stay in `links.ts`
 * (they already take a user_id).
 */
import { prisma } from '@/lib/prisma'
import { build_actor_copy, other_user, my_txn_id, their_txn_id } from '@/app/_utils/links'
import { notify_request_rejected } from '@/app/_utils/notify_events'
import { invalidate_balances } from '@/app/_core/balances_core'
import { logger } from '@/lib/logger'
import { ActionResult, ok, fromError, ActionError } from '@/app/_actions/_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

// Approve the request currently awaiting me. For a `change` request I author my
// balanced copy (the locked mirrored lines are added server-side); for a
// `deletion` request I remove my copy and the link closes.
export async function approve_request_core(
  me: string,
  link_id: string,
  balancing_lines: CreateLineItemInput[] = [],
  auto_balance_account_id?: string,
): Promise<ActionResult> {
  try {
    const { other_id } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.pending_status !== 'pending' || link.pending_by !== me)
        throw new ActionError('VALIDATION', 'This request is not awaiting your approval')

      const other_id = other_user(link, me)
      if (link.pending_kind === 'deletion') {
        const mine = my_txn_id(link, me)
        if (mine) await tx.transaction.delete({ where: { id: mine } })
        await tx.transaction_link.delete({ where: { id: link.id } })
      } else {
        await build_actor_copy(tx, link, me, balancing_lines, auto_balance_account_id)
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

// Bulk-approve every pending `change` request from one counterparty, auto-balancing
// each onto a single chosen personal account (an account-only transfer). Used after
// linking an account retroactively backfills many requests.
export async function accept_all_from_core(
  me: string,
  counterparty_id: string,
  balancing_account_id: string,
): Promise<ActionResult<{ approved: number }>> {
  try {
    if (!balancing_account_id) throw new ActionError('VALIDATION', 'Pick an account to balance with')

    const { approved } = await prisma.$transaction(
      async tx => {
        const acc = await tx.accounting_head.findFirst({
          where: { id: balancing_account_id, user_id: me, type: 'account' },
          select: { id: true, linked_user_id: true },
        })
        if (!acc) throw new ActionError('NOT_FOUND', 'Balancing account not found')
        if (acc.linked_user_id) throw new ActionError('VALIDATION', 'Pick one of your own accounts (not a linked one) to balance with')

        const links = await tx.transaction_link.findMany({
          where: {
            pending_by: me,
            pending_status: 'pending',
            pending_kind: 'change',
            OR: [{ user_a_id: counterparty_id }, { user_b_id: counterparty_id }],
          },
        })
        let approved = 0
        for (const link of links) {
          if (other_user(link, me) !== counterparty_id) continue
          await build_actor_copy(tx, link, me, [], balancing_account_id)
          approved++
        }
        return { approved }
      },
      { timeout: 30_000 },
    )

    await Promise.all([invalidate_balances(me), invalidate_balances(counterparty_id)])
    return ok({ approved }, `Approved ${approved} request${approved === 1 ? '' : 's'}`)
  } catch (error) {
    logger.error({ err: error, action: 'accept_all_from' }, 'accept_all_from failed')
    return fromError(error)
  }
}

// Cancel a request I sent that's still awaiting the other side. If there's a
// prior approved copy on their side, revert my copy back to it (keeping my own
// non-linked lines); otherwise (never approved) just withdraw the request.
export async function cancel_request_core(me: string, link_id: string): Promise<ActionResult> {
  try {
    const { other_id, reverted } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.user_a_id !== me && link.user_b_id !== me) throw new ActionError('VALIDATION', 'This is not your request')
      if (link.pending_status !== 'pending') throw new ActionError('VALIDATION', 'Only a pending request can be cancelled')
      if (link.pending_by === me) throw new ActionError('VALIDATION', 'This request is awaiting your approval — approve or reject it instead')

      const other_id = other_user(link, me)
      const anchor = their_txn_id(link, me) // the other side's approved copy, if any
      if (!anchor) {
        await tx.transaction_link.delete({ where: { id: link.id } })
        return { other_id, reverted: false }
      }

      // Revert my copy to the anchor: keep my own non-linked lines, rebuild the
      // mirrored lines from the anchor (build_actor_copy uses the anchor as source).
      const recip = await tx.accounting_head.findFirst({
        where: { user_id: me, linked_user_id: other_id, type: 'account' },
        select: { id: true },
      })
      let balancing: CreateLineItemInput[] = []
      const myTxnId = my_txn_id(link, me)
      if (myTxnId && recip) {
        const mine = await tx.transaction.findUnique({ where: { id: myTxnId }, include: { line_items: true } })
        balancing = (mine?.line_items ?? [])
          .filter(li => li.accounting_head_id !== recip.id)
          .map(li => ({
            accounting_head_id: li.accounting_head_id,
            asset_id: li.asset_id,
            quantity: li.quantity === null ? undefined : li.quantity.toNumber(),
            txn_value: li.txn_value === null ? null : li.txn_value.toNumber(),
            description: li.description ?? null,
            datetime: li.datetime ?? null,
          }))
      }
      await build_actor_copy(tx, link, me, balancing)
      return { other_id, reverted: true }
    })

    if (reverted) await Promise.all([invalidate_balances(me), invalidate_balances(other_id)])
    return ok(undefined, reverted ? 'Cancelled — reverted to the approved version' : 'Request cancelled')
  } catch (error) {
    logger.error({ err: error, action: 'cancel_request' }, 'cancel_request failed')
    return fromError(error)
  }
}

// Reject the request awaiting me. The ball passes back to the proposer, whose
// copy is now poisoned/absent; they resolve it (resubmit, revert, or delete).
export async function reject_request_core(me: string, link_id: string): Promise<ActionResult> {
  try {
    const { proposer_id, description } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.pending_status !== 'pending' || link.pending_by !== me) throw new ActionError('VALIDATION', 'This request is not awaiting your action')

      const proposer_id = other_user(link, me)
      await tx.transaction_link.update({
        where: { id: link.id },
        data: { pending_status: 'rejected', pending_by: proposer_id },
      })

      // The proposer's copy is the one that diverged; grab its description for
      // the notification (their txn from my perspective).
      const their_txn = their_txn_id(link, me)
      const txn = their_txn ? await tx.transaction.findUnique({ where: { id: their_txn }, select: { description: true } }) : null
      return { proposer_id, description: txn?.description ?? null }
    })

    void notify_request_rejected(proposer_id, me, description)
    return ok(undefined, 'Request rejected')
  } catch (error) {
    return fromError(error)
  }
}

// Discard my rejected change and rebuild my copy from the counterpart's
// still-approved anchor. I supply fresh balancing lines; the mirrored lines come
// from the anchor.
export async function revert_request_core(
  me: string,
  link_id: string,
  balancing_lines: CreateLineItemInput[] = [],
  auto_balance_account_id?: string,
): Promise<ActionResult> {
  try {
    const { other_id } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.pending_status !== 'rejected' || link.pending_by !== me)
        throw new ActionError('VALIDATION', 'There is no rejected request for you to revert')

      await build_actor_copy(tx, link, me, balancing_lines, auto_balance_account_id)
      return { other_id: other_user(link, me) }
    })

    await Promise.all([invalidate_balances(me), invalidate_balances(other_id)])
    return ok(undefined, 'Reverted to the approved version')
  } catch (error) {
    logger.error({ err: error, action: 'revert_request' }, 'revert_request failed')
    return fromError(error)
  }
}
