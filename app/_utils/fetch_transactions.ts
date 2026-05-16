import { prisma } from '@/lib/prisma'
import { normalize_txn } from './normalize_txn'

export async function fetch_and_normalize_transactions(line_items: { transaction_id: string }[]) {
  const tx_ids = Array.from(new Set(line_items.map(li => li.transaction_id)))
  const rawTransactions = await prisma.transaction.findMany({
    where: { id: { in: tx_ids } },
    include: { line_items: { include: { account: true, asset: true } } },
  })
  const transactions = rawTransactions.map(normalize_txn)
  const normalizedById = new Map<string, (typeof transactions)[0]['line_items'][0]>()
  for (const tx of transactions) for (const li of tx.line_items) normalizedById.set(li.id, li)
  return { rawTransactions, normalizedById }
}
