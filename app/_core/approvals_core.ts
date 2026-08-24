import { prisma } from '@/lib/prisma'
import { build_actor_copy, other_user, my_txn_id, their_txn_id } from '@/app/_utils/links'
import { assert_no_locked_lines } from '@/app/_utils/lock_date'
import { notify_request_rejected } from '@/app/_utils/notify_events'
import { invalidate_balances } from '@/app/_core/balances_core'
import type { TouchedEntities } from '@/app/_utils/value_timeseries'
import { logger } from '@/lib/logger'
import { ActionResult, ok, fromError, ActionError } from '@/app/_actions/_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

const no_touched = (): TouchedEntities => ({ head_ids: [], asset_ids: [] })

export async function approve_request_core(
  me: string,
  link_id: string,
  balancing_lines: CreateLineItemInput[] = [],
  auto_balance_account_id?: string,
): Promise<ActionResult> {
  try {
    const { other_id, touched_mine, touched_theirs } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.pending_status !== 'pending' || link.pending_by !== me)
        throw new ActionError('VALIDATION', 'This request is not awaiting your approval')

      const other_id = other_user(link, me)
      if (link.pending_kind === 'deletion') {
        const mine = my_txn_id(link, me)
        let touched_mine = no_touched()
        if (mine) {
          const doomed = await tx.transaction.findUnique({
            where: { id: mine },
            select: {
              datetime: true,
              line_items: {
                select: { datetime: true, accounting_head_id: true, asset_id: true, accounting_head: { select: { name: true, lock_date: true } } },
              },
            },
          })
          if (doomed) {
            assert_no_locked_lines('approve the deletion of', doomed.datetime, doomed.line_items)
            touched_mine = {
              head_ids: doomed.line_items.map(li => li.accounting_head_id),
              asset_ids: doomed.line_items.map(li => li.asset_id),
            }
          }
          await tx.transaction.delete({ where: { id: mine } })
        }
        await tx.transaction_link.delete({ where: { id: link.id } })
        // The counterparty's rows don't change on a deletion approval — their copy was
        // already gone when they requested it.
        return { other_id, touched_mine, touched_theirs: no_touched() }
      }
      const touched = await build_actor_copy(tx, link, me, balancing_lines, auto_balance_account_id)
      return { other_id, touched_mine: touched.mine, touched_theirs: touched.theirs }
    })

    await Promise.all([invalidate_balances(me, touched_mine), invalidate_balances(other_id, touched_theirs)])
    return ok(undefined, 'Request approved')
  } catch (error) {
    logger.error({ err: error, action: 'approve_request' }, 'approve_request failed')
    return fromError(error)
  }
}

export async function accept_all_from_core(
  me: string,
  counterparty_id: string,
  balancing_account_id: string,
): Promise<ActionResult<{ approved: number }>> {
  try {
    if (!balancing_account_id) throw new ActionError('VALIDATION', 'Pick an account to balance with')

    const { approved, touched_mine, touched_theirs } = await prisma.$transaction(
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
        const relevant = links.filter(l => other_user(l, me) === counterparty_id)

        let approved = 0
        const mine_heads = new Set<string>()
        const mine_assets = new Set<string>()
        const their_heads = new Set<string>()
        const their_assets = new Set<string>()
        if (relevant.length > 0) {
          // Everything loop-invariant is fetched once: the reciprocal head, all source
          // transactions, the two heads every copy touches, and the union of the assets
          // the mirrored lines can carry. recip stays possibly-null here so the
          // zero-links case above never errors — build_actor_copy throws on first use.
          const recip = await tx.accounting_head.findFirst({
            where: { user_id: me, linked_user_id: counterparty_id, type: 'account' },
            select: { id: true },
          })
          const source_ids = relevant.map(l => their_txn_id(l, me)).filter((x): x is string => !!x)
          const sources = await tx.transaction.findMany({
            where: { id: { in: source_ids } },
            include: { line_items: { include: { accounting_head: true } } },
          })
          const src_by_id = new Map(sources.map(s => [s.id, s]))
          const heads = await tx.accounting_head.findMany({
            where: { id: { in: recip ? [recip.id, balancing_account_id] : [balancing_account_id] }, user_id: me },
          })
          const asset_ids = Array.from(
            new Set(sources.flatMap(s => s.line_items.filter(li => li.accounting_head.linked_user_id === me).map(li => li.asset_id))),
          )
          const assets = asset_ids.length ? await tx.asset.findMany({ where: { id: { in: asset_ids } } }) : []

          for (const link of relevant) {
            const source_id = their_txn_id(link, me)
            const touched = await build_actor_copy(tx, link, me, [], balancing_account_id, {
              recip,
              source: source_id ? src_by_id.get(source_id) : undefined,
              heads,
              assets,
            })
            for (const h of touched.mine.head_ids) mine_heads.add(h)
            for (const a of touched.mine.asset_ids) mine_assets.add(a)
            for (const h of touched.theirs.head_ids) their_heads.add(h)
            for (const a of touched.theirs.asset_ids) their_assets.add(a)
            approved++
          }
        }
        return {
          approved,
          touched_mine: { head_ids: mine_heads, asset_ids: mine_assets },
          touched_theirs: { head_ids: their_heads, asset_ids: their_assets },
        }
      },
      { timeout: 30_000 },
    )

    await Promise.all([invalidate_balances(me, touched_mine), invalidate_balances(counterparty_id, touched_theirs)])
    return ok({ approved }, `Approved ${approved} request${approved === 1 ? '' : 's'}`)
  } catch (error) {
    logger.error({ err: error, action: 'accept_all_from' }, 'accept_all_from failed')
    return fromError(error)
  }
}

export async function cancel_request_core(me: string, link_id: string): Promise<ActionResult> {
  try {
    const { other_id, reverted, touched_mine, touched_theirs } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.user_a_id !== me && link.user_b_id !== me) throw new ActionError('VALIDATION', 'This is not your request')
      if (link.pending_status !== 'pending') throw new ActionError('VALIDATION', 'Only a pending request can be cancelled')
      if (link.pending_by === me) throw new ActionError('VALIDATION', 'This request is awaiting your approval — approve or reject it instead')

      const other_id = other_user(link, me)
      const anchor = their_txn_id(link, me)
      if (!anchor) {
        await tx.transaction_link.delete({ where: { id: link.id } })
        return { other_id, reverted: false, touched_mine: no_touched(), touched_theirs: no_touched() }
      }

      const recip = await tx.accounting_head.findFirst({
        where: { user_id: me, linked_user_id: other_id, type: 'account' },
        select: { id: true },
      })
      let balancing: CreateLineItemInput[] = []
      const myTxnId = my_txn_id(link, me)
      if (myTxnId && recip) {
        const mine = await tx.transaction.findUnique({
          where: { id: myTxnId },
          select: {
            line_items: {
              select: { accounting_head_id: true, asset_id: true, quantity: true, txn_value: true, description: true, datetime: true },
            },
          },
        })
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
      const touched = await build_actor_copy(tx, link, me, balancing)
      return { other_id, reverted: true, touched_mine: touched.mine, touched_theirs: touched.theirs }
    })

    if (reverted) await Promise.all([invalidate_balances(me, touched_mine), invalidate_balances(other_id, touched_theirs)])
    return ok(undefined, reverted ? 'Cancelled — reverted to the approved version' : 'Request cancelled')
  } catch (error) {
    logger.error({ err: error, action: 'cancel_request' }, 'cancel_request failed')
    return fromError(error)
  }
}

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

export async function revert_request_core(
  me: string,
  link_id: string,
  balancing_lines: CreateLineItemInput[] = [],
  auto_balance_account_id?: string,
): Promise<ActionResult> {
  try {
    const { other_id, touched } = await prisma.$transaction(async tx => {
      const link = await tx.transaction_link.findUnique({ where: { id: link_id } })
      if (!link) throw new ActionError('NOT_FOUND', 'Request not found')
      if (link.pending_status !== 'rejected' || link.pending_by !== me)
        throw new ActionError('VALIDATION', 'There is no rejected request for you to revert')

      const touched = await build_actor_copy(tx, link, me, balancing_lines, auto_balance_account_id)
      return { other_id: other_user(link, me), touched }
    })

    await Promise.all([invalidate_balances(me, touched.mine), invalidate_balances(other_id, touched.theirs)])
    return ok(undefined, 'Reverted to the approved version')
  } catch (error) {
    logger.error({ err: error, action: 'revert_request' }, 'revert_request failed')
    return fromError(error)
  }
}
