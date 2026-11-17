'use server'

import { get_current_user_id } from '@/app/_actions/auth'
import { prisma } from '@/lib/prisma'
import { load_subtree_head_ids } from '@/app/_utils/subtree_value'
import { line_item_page } from '@/app/_utils/line_item_paging'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import type { LineItem } from '@/app/_components/HeadDetailPage'
import { load_head_line_items } from './head_line_items'

// The next page of a head's line items, for the page's "Show more" button. Like the
// closing-balance action, the client sends a flag for the subtree view, never a list of
// ids, and the subtree is resolved here from the caller's own heads.
export async function get_more_head_line_items(head_id: string, offset: number, include_subheads = false): Promise<ActionResult<LineItem[]>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    if (line_item_page([], offset) === null) return err('VALIDATION', 'Invalid offset')
    const head = await prisma.accounting_head.findUnique({ where: { id: head_id, user_id }, select: { id: true, type: true } })
    if (!head) return err('NOT_FOUND', 'Head not found')

    const scoped_head_ids = include_subheads ? await load_subtree_head_ids(head.id, user_id) : new Set([head.id])
    const { line_items } = await load_head_line_items({
      user_id,
      head_id: head.id,
      is_account: head.type === 'account',
      scoped_head_ids,
      scope: scoped_head_ids.size > 1 ? 'subtree' : 'self',
    })
    return ok(line_item_page(line_items, offset)!)
  } catch (error) {
    return reportActionError(error, { action: 'get_more_head_line_items', entity: 'accounting_head' })
  }
}
