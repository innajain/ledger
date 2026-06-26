'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { approve_request_core, accept_all_from_core, cancel_request_core, reject_request_core, revert_request_core } from '@/app/_core/approvals_core'
import { ActionResult, err } from './_result'
import type { CreateLineItemInput } from './transactions'

export async function approve_request(link_id: string, balancing_lines: CreateLineItemInput[] = []): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return approve_request_core(me, link_id, balancing_lines)
}

export async function accept_all_from(counterparty_id: string, balancing_account_id: string): Promise<ActionResult<{ approved: number }>> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return accept_all_from_core(me, counterparty_id, balancing_account_id)
}

export async function cancel_request(link_id: string): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return cancel_request_core(me, link_id)
}

export async function reject_request(link_id: string): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return reject_request_core(me, link_id)
}

export async function revert_request(link_id: string, balancing_lines: CreateLineItemInput[] = []): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'unauthorized')
  return revert_request_core(me, link_id, balancing_lines)
}
