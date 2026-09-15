'use server'

import { prisma } from '@/lib/prisma'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { get_current_user_id } from '@/app/_actions/auth'
import { ActionResult, ok, err } from '@/app/_actions/_result'
import { reportActionError } from '@/lib/action_error'
import { audit } from '@/lib/logger'

export type MyTxnValidation = {
  checked: number
  invalid: { id: string; datetime: string; description: string | null; message: string }[]
}

// User-scoped integrity check (unlike validate_all_txns, which is admin-only
// and scans every user): re-run the balancing invariant over the caller's own
// transactions and report the ones that fail.
export async function validate_my_txns(): Promise<ActionResult<MyTxnValidation>> {
  const user_id = await get_current_user_id()
  if (!user_id) return err('UNAUTHORIZED', 'unauthorized')
  try {
    const transactions = await prisma.transaction.findMany({
      where: { user_id },
      include: { line_items: { include: { accounting_head: true, asset: true } } },
    })
    const invalid: MyTxnValidation['invalid'] = []
    for (const txn of transactions) {
      const { is_valid, message } = validate_line_items(txn.line_items)
      if (!is_valid) invalid.push({ id: txn.id, datetime: txn.datetime.toISOString(), description: txn.description, message })
    }
    audit('transaction.validate_mine', user_id, { checked_count: transactions.length, invalid_count: invalid.length })
    return ok({ checked: transactions.length, invalid })
  } catch (error) {
    return reportActionError(error, { action: 'transaction.validate_mine' })
  }
}
