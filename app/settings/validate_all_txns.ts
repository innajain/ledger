'use server'

import { prisma } from '@/lib/prisma'
import { validate_line_items } from '@/app/_utils/validate_line_items'
import { require_admin } from '@/app/_actions/auth'
import { audit } from '@/lib/logger'

export async function validate_all_txns() {
  const admin_id = await require_admin()
  const transactions = await prisma.transaction.findMany({
    include: { line_items: { include: { accounting_head: true, asset: true } } },
  })
  const wrong_txns = []

  for (const txn of transactions) {
    const { is_valid, message } = validate_line_items(txn.line_items)
    if (!is_valid) {
      wrong_txns.push({ id: txn.id, message })
    }
  }
  audit('admin.validate_all_transactions', admin_id, { checked_count: transactions.length, invalid_count: wrong_txns.length })
  return wrong_txns
}
