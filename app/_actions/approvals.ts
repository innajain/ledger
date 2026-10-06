'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import {
  approve_request_core,
  approve_onto_account_core,
  approve_keeping_lines_core,
  accept_all_from_core,
  cancel_request_core,
  reject_request_core,
  revert_request_core,
} from '@/app/_core/approvals_core'
import { ActionResult, err } from './_result'
import type { CreateLineItemInput } from '@/app/_core/transactions_core'

export async function approve_request(link_id: string, balancing_lines: CreateLineItemInput[] = []): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return approve_request_core(me, link_id, balancing_lines)
}

export async function approve_onto_account(link_id: string, account_id: string): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return approve_onto_account_core(me, link_id, account_id)
}

export async function approve_keeping_lines(link_id: string): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return approve_keeping_lines_core(me, link_id)
}

export async function accept_all_from(counterparty_id: string, balancing_account_id: string): Promise<ActionResult<{ approved: number }>> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return accept_all_from_core(me, counterparty_id, balancing_account_id)
}

export async function cancel_request(link_id: string): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return cancel_request_core(me, link_id)
}

export async function reject_request(link_id: string): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return reject_request_core(me, link_id)
}

export async function revert_request(link_id: string, balancing_lines: CreateLineItemInput[] = []): Promise<ActionResult> {
  const me = await get_current_user_id()
  if (!me) return err('UNAUTHORIZED', 'Your session has expired — log in again')
  return revert_request_core(me, link_id, balancing_lines)
}
