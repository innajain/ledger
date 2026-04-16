'use server'

import { prisma } from '@/lib/prisma'
import { validate_line_items } from '../_utils/validate_line_items'

export async function validate_all_txns() {
  const transactions = await prisma.transaction.findMany({
    include: { line_items: { include: { account: true, asset: true } } },
  })
  const wrong_txns = []

  for (const txn of transactions) {
    const { is_valid, message } = validate_line_items(txn.line_items)
    if (!is_valid) {
      wrong_txns.push({ id: txn.id, message })
    }
  }
  return wrong_txns
}
